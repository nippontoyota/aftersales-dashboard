import { pool } from "@/lib/db";
import { listBranchCodes } from "@/lib/admin-store";
import { REGIONS, regionForBranch, type RegionName } from "@/lib/regions";
import { resolveBranchCode } from "./branch-match";

export type BpReferralRow = {
  id: number;
  referring_employee_id: string | null;
  referring_employee_name: string | null;
  referring_employee_branch: string | null;
  vehicle_image_url: string | null;
  customer_phone: string | null;
  submitted_at: Date | string | null;
  vehicle_reg_no: string | null;
  location: string | null;
  description: string | null;
  assigned_branch: string | null;
  call_status: "pending" | "not_connected" | "connected";
  genuine: boolean | null;
  estimate_amount: string | null;
  customer_interested: boolean | null;
  payment_type: "CP" | "IP" | null;
  validated_at: Date | string | null;
  handled_by: string | null;
  matched_ro_no: string | null;
  ro_matched_at: Date | string | null;
  closed_at: Date | string | null;
  closed_reason: "not_genuine" | "not_interested" | null;
  last_contacted_at: Date | string | null;
  /** Most recent transfer's origin branch, if this referral has ever been
   * transferred — null otherwise. Joined in, not a real column. */
  transferred_from: string | null;
};

const SELECT_COLUMNS = `
  r.id, r.referring_employee_id, r.referring_employee_name, r.referring_employee_branch,
  r.vehicle_image_url, r.customer_phone, r.submitted_at, r.vehicle_reg_no, r.location, r.description,
  r.assigned_branch, r.call_status, r.genuine, r.estimate_amount, r.customer_interested, r.payment_type,
  r.validated_at, r.handled_by, r.matched_ro_no, r.ro_matched_at, r.closed_at, r.closed_reason, r.last_contacted_at,
  lt.from_branch as transferred_from
`;

const LATEST_TRANSFER_JOIN = `
  left join lateral (
    select from_branch from bp_referral_transfers t
    where t.referral_id = r.id order by t.transferred_at desc limit 1
  ) lt on true
`;

/** Resolves and persists assigned_branch for any referral the external
 * WhatsApp bot inserted without one (every new row — the bot has no
 * knowledge of this column) or whose stored value isn't a real branch code
 * yet. Self-healing: cheap at current volume, run once before any queue
 * read. Rows whose free-text branch name doesn't match anything known stay
 * unresolved (assigned_branch null) — they fall outside every BPM's queue
 * until BP HO manually assigns one (a later step), rather than silently
 * landing on a guessed branch. */
export async function ensureAssignedBranches(): Promise<void> {
  const validCodes = await listBranchCodes();
  const { rows } = await pool.query<{ id: number; referring_employee_branch: string | null }>(
    `select id, referring_employee_branch from bp_referrals
     where assigned_branch is null or assigned_branch <> all($1::text[])`,
    [validCodes],
  );
  for (const row of rows) {
    const resolved = resolveBranchCode(row.referring_employee_branch);
    if (resolved && validCodes.includes(resolved)) {
      await pool.query(`update bp_referrals set assigned_branch = $1 where id = $2`, [resolved, row.id]);
    }
  }
}

export async function loadQueueForBranch(branch: string): Promise<BpReferralRow[]> {
  const { rows } = await pool.query<BpReferralRow>(
    `select ${SELECT_COLUMNS} from bp_referrals r ${LATEST_TRANSFER_JOIN}
     where r.assigned_branch = $1 order by r.submitted_at desc`,
    [branch],
  );
  return rows;
}

/** Read-only, for the three regional-lead BPMs (CO01A/KL01B/TI01A) — every
 * referral across their whole region, own branch included. */
export async function loadRegionRollup(region: RegionName): Promise<BpReferralRow[]> {
  const branches = REGIONS[region].filter((b) => b !== "CO01C");
  const { rows } = await pool.query<BpReferralRow>(
    `select ${SELECT_COLUMNS} from bp_referrals r ${LATEST_TRANSFER_JOIN}
     where r.assigned_branch = any($1::text[]) order by r.submitted_at desc`,
    [branches],
  );
  return rows;
}

/** The region a BPM's own branch leads a rollup for — null for the other
 * 15 branches, which only ever see their own queue. */
export function regionalLeadFor(branch: string): RegionName | null {
  if (branch === "CO01A") return "Central";
  if (branch === "KL01B") return "South";
  if (branch === "TI01A") return "North";
  return null;
}

async function assertOwnedByBranch(id: number, branch: string): Promise<void> {
  const { rows } = await pool.query<{ assigned_branch: string | null }>(
    `select assigned_branch from bp_referrals where id = $1`,
    [id],
  );
  if (!rows[0] || rows[0].assigned_branch !== branch) {
    throw new Error("This referral isn't assigned to your branch.");
  }
}

export async function markNotConnected(id: number, branch: string): Promise<void> {
  await assertOwnedByBranch(id, branch);
  await pool.query(`update bp_referrals set call_status = 'not_connected' where id = $1`, [id]);
}

/** Validated (genuine + interested) referrals the BPM hasn't checked in on
 * for 3+ days and the car still hasn't come in — the follow-up popup's data
 * source (see bp-followup-popup-gate.tsx). last_contacted_at is the clock:
 * set when the call outcome is first recorded, and bumped again by
 * logFollowUpContact below every time the BPM re-contacts the customer. */
export async function loadOverdueFollowUps(branch: string): Promise<BpReferralRow[]> {
  const { rows } = await pool.query<BpReferralRow>(
    `select ${SELECT_COLUMNS} from bp_referrals r ${LATEST_TRANSFER_JOIN}
     where r.assigned_branch = $1 and r.genuine = true and r.customer_interested = true
       and r.closed_at is null and r.ro_matched_at is null
       and r.last_contacted_at <= now() - interval '3 days'
     order by r.last_contacted_at asc`,
    [branch],
  );
  return rows;
}

/** BPM re-contacted the customer on an already-validated referral — resets
 * the 3-day follow-up clock without touching anything else recorded about
 * the call. */
export async function logFollowUpContact(id: number, branch: string): Promise<void> {
  await assertOwnedByBranch(id, branch);
  await pool.query(`update bp_referrals set last_contacted_at = now() where id = $1`, [id]);
}

export type CallOutcome =
  | { genuine: false }
  | { genuine: true; estimateAmount: number; customerInterested: false }
  | { genuine: true; estimateAmount: number; customerInterested: true; paymentType: "CP" | "IP" };

/** The one-form submission once a BPM actually connects with the customer —
 * genuine/estimate/interested/CP-IP all recorded together. Not genuine, or
 * genuine-but-not-interested, closes the referral out immediately (no
 * follow-up, no payout, no employee message). Genuine + interested stamps
 * validated_at/eligibility_triggered_at — the ₹50 payout point and the hook
 * for the user's own external WhatsApp-eligibility automation. */
export async function submitCallOutcome(id: number, branch: string, handledBy: string, outcome: CallOutcome): Promise<void> {
  await assertOwnedByBranch(id, branch);
  if (!outcome.genuine) {
    await pool.query(
      `update bp_referrals set call_status = 'connected', genuine = false, handled_by = $2,
         last_contacted_at = now(), closed_at = now(), closed_reason = 'not_genuine'
       where id = $1`,
      [id, handledBy],
    );
    return;
  }
  if (!outcome.customerInterested) {
    await pool.query(
      `update bp_referrals set call_status = 'connected', genuine = true, estimate_amount = $3,
         customer_interested = false, handled_by = $2,
         last_contacted_at = now(), closed_at = now(), closed_reason = 'not_interested'
       where id = $1`,
      [id, handledBy, outcome.estimateAmount],
    );
    return;
  }
  await pool.query(
    `update bp_referrals set call_status = 'connected', genuine = true, estimate_amount = $3,
       customer_interested = true, payment_type = $4, handled_by = $2,
       last_contacted_at = now(), validated_at = now(), eligibility_triggered_at = now()
     where id = $1`,
    [id, handledBy, outcome.estimateAmount, outcome.paymentType],
  );
}

/** Branch transfer — e.g. a Kalamassery employee's referral whose customer
 * actually wants Kollam's showroom to do the work. assigned_branch moves to
 * the new branch; referring_employee_branch (and so the payout attribution)
 * never changes. Logged in bp_referral_transfers for BP HO's audit trail.
 * Allowed any time before the referral is closed or RO-matched. */
export async function transferReferral(id: number, fromBranch: string, toBranch: string, transferredBy: string): Promise<void> {
  await assertOwnedByBranch(id, fromBranch);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into bp_referral_transfers (referral_id, from_branch, to_branch, transferred_by) values ($1, $2, $3, $4)`,
      [id, fromBranch, toBranch, transferredBy],
    );
    await client.query(`update bp_referrals set assigned_branch = $2 where id = $1`, [id, toBranch]);
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

/** BP HO's company-wide view — every referral, newest first. Unlike a
 * BPM's own queue this isn't scoped to a branch; ensureAssignedBranches()
 * is still the caller's job to run first (see page.tsx) so assigned_branch
 * is resolved before this reads it. */
export async function loadAllReferrals(): Promise<BpReferralRow[]> {
  const { rows } = await pool.query<BpReferralRow>(
    `select ${SELECT_COLUMNS} from bp_referrals r ${LATEST_TRANSFER_JOIN} order by r.submitted_at desc`,
  );
  return rows;
}

export type PayoutLedgerRow = {
  employeeId: string | null;
  employeeName: string | null;
  /** The employee's own branch as submitted (free text, e.g. "Kalamassery")
   * — never assigned_branch, since the payout always follows the original
   * referring employee regardless of any transfer (see transferReferral). */
  employeeBranch: string | null;
  validatedCount: number;
  completedCount: number;
  amountOwed: number;
};

const VALIDATED_PAYOUT = 50;
const COMPLETED_PAYOUT = 200;

/** ₹50 per validated (genuine + interested) referral, another ₹200 once
 * its RO is matched (see ro-matcher.ts) — grouped per referring employee,
 * for BP HO to action payment manually (see the CSV export route). Only
 * employees with at least one validated referral appear; nothing is owed
 * otherwise. */
export async function loadPayoutLedger(): Promise<PayoutLedgerRow[]> {
  const { rows } = await pool.query<{
    referring_employee_id: string | null;
    referring_employee_name: string | null;
    referring_employee_branch: string | null;
    validated_count: string;
    completed_count: string;
  }>(
    `select referring_employee_id, referring_employee_name, referring_employee_branch,
            count(*) filter (where validated_at is not null) as validated_count,
            count(*) filter (where ro_matched_at is not null) as completed_count
     from bp_referrals
     where validated_at is not null
     group by referring_employee_id, referring_employee_name, referring_employee_branch`,
  );
  return rows
    .map((r) => {
      const validatedCount = Number(r.validated_count);
      const completedCount = Number(r.completed_count);
      return {
        employeeId: r.referring_employee_id,
        employeeName: r.referring_employee_name,
        employeeBranch: r.referring_employee_branch,
        validatedCount,
        completedCount,
        amountOwed: validatedCount * VALIDATED_PAYOUT + completedCount * COMPLETED_PAYOUT,
      };
    })
    .sort((a, b) => b.amountOwed - a.amountOwed);
}

export type BranchRollupRow = {
  branch: string;
  region: RegionName | null;
  total: number;
  validated: number;
  completed: number;
  notGenuine: number;
  notInterested: number;
  pending: number;
};

/** Company-wide branch/region breakdown — grouped by assigned_branch (where
 * the work currently sits), not the referring employee's own branch. */
export async function loadBranchRollup(): Promise<BranchRollupRow[]> {
  const { rows } = await pool.query<{
    assigned_branch: string | null;
    total: string;
    validated: string;
    completed: string;
    not_genuine: string;
    not_interested: string;
    pending: string;
  }>(
    `select assigned_branch,
            count(*) as total,
            count(*) filter (where validated_at is not null) as validated,
            count(*) filter (where ro_matched_at is not null) as completed,
            count(*) filter (where closed_reason = 'not_genuine') as not_genuine,
            count(*) filter (where closed_reason = 'not_interested') as not_interested,
            count(*) filter (where closed_at is null and validated_at is null) as pending
     from bp_referrals
     where assigned_branch is not null and assigned_branch <> ''
     group by assigned_branch
     order by assigned_branch`,
  );
  return rows.map((r) => ({
    branch: r.assigned_branch ?? "",
    region: regionForBranch(r.assigned_branch ?? ""),
    total: Number(r.total),
    validated: Number(r.validated),
    completed: Number(r.completed),
    notGenuine: Number(r.not_genuine),
    notInterested: Number(r.not_interested),
    pending: Number(r.pending),
  }));
}

/** BP HO manually assigning a branch to a referral whose free-text location
 * didn't resolve to anything (resolveBranchCode() came back null) — the
 * only way such a referral ever becomes visible to a BPM's queue. No
 * ownership check (there's no current owner to check against), just that
 * the target is a real branch. */
export async function assignBranch(id: number, branch: string): Promise<void> {
  await pool.query(`update bp_referrals set assigned_branch = $2 where id = $1`, [id, branch]);
}

export type StaleReferralRow = {
  id: number;
  referringEmployeeName: string | null;
  assignedBranch: string | null;
  submittedAt: Date | string | null;
  callStatus: "pending" | "not_connected";
  daysSinceSubmitted: number;
};

const STALE_AFTER_DAYS = 3;

/** Referrals still in "to call"/"not connected" — no contact ever
 * recorded, let alone resolved — 3+ days after being submitted. Unlike the
 * 3-day follow-up popup (which only watches validated+interested referrals
 * already being worked), this is BP HO's own oversight signal for leads
 * nobody has touched at all yet; no popup, just visible on the dashboard. */
export async function loadStaleReferrals(): Promise<StaleReferralRow[]> {
  const { rows } = await pool.query<{
    id: number;
    referring_employee_name: string | null;
    assigned_branch: string | null;
    submitted_at: Date | string | null;
    call_status: "pending" | "not_connected";
    days_since: string;
  }>(
    `select id, referring_employee_name, assigned_branch, submitted_at, call_status,
            extract(day from now() - submitted_at)::int as days_since
     from bp_referrals
     where call_status in ('pending', 'not_connected')
       and closed_at is null and validated_at is null
       and submitted_at <= now() - interval '${STALE_AFTER_DAYS} days'
     order by submitted_at asc`,
  );
  return rows.map((r) => ({
    id: r.id,
    referringEmployeeName: r.referring_employee_name,
    assignedBranch: r.assigned_branch,
    submittedAt: r.submitted_at,
    callStatus: r.call_status,
    daysSinceSubmitted: Number(r.days_since),
  }));
}
