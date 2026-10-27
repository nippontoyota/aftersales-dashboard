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
  /** Captured by the WhatsApp webhook from 2026-10-15 onward (Shiva's
   * commit) — null on anything submitted before that. The BPM needs this to
   * give an estimate, so it's surfaced right next to the reg no everywhere
   * a referral is shown. */
  vehicle_model: string | null;
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
  pending_ro_no: string | null;
  pending_ro_entered_at: Date | string | null;
  closed_at: Date | string | null;
  closed_reason: "not_genuine" | "not_interested" | "lost" | null;
  /** Why the customer declined, once genuine + not interested — a distinct
   * structured field from the call-outcome remark/damage description,
   * which stays in bp_referral_activity (2026-10-17, the user's call). */
  not_interested_reason: string | null;
  /** Why a validated (genuine + interested) referral got closed out as
   * "Lost" instead of completing — e.g. the customer took the car to
   * another workshop. Mandatory on that path, same shape as
   * not_interested_reason (2026-10-27, the user's request). */
  lost_reason: string | null;
  last_contacted_at: Date | string | null;
  /** Most recent transfer's origin branch, if this referral has ever been
   * transferred — null otherwise. Joined in, not a real column. */
  transferred_from: string | null;
};

const SELECT_COLUMNS = `
  r.id, r.referring_employee_id, r.referring_employee_name, r.referring_employee_branch,
  r.vehicle_image_url, r.customer_phone, r.submitted_at, r.vehicle_reg_no, r.vehicle_model, r.location, r.description,
  r.assigned_branch, r.call_status, r.genuine, r.estimate_amount, r.customer_interested, r.payment_type,
  r.validated_at, r.handled_by, r.matched_ro_no, r.ro_matched_at, r.pending_ro_no, r.pending_ro_entered_at,
  r.closed_at, r.closed_reason, r.not_interested_reason, r.lost_reason,
  r.last_contacted_at, lt.from_branch as transferred_from
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

async function logActivity(
  referralId: number,
  activityType: "not_connected" | "call_outcome" | "follow_up" | "ro_entered" | "lost",
  remark: string,
  performedBy: string,
  notConnectedReason?: string,
): Promise<void> {
  await pool.query(
    `insert into bp_referral_activity (referral_id, activity_type, remark, performed_by, not_connected_reason) values ($1, $2, $3, $4, $5)`,
    [referralId, activityType, remark, performedBy, notConnectedReason ?? null],
  );
}

/** Every BP referral action requires a reason/remark (2026-10-15, the
 * user's explicit call for accountability) — see bp_referral_activity in
 * schema.sql for the full history this builds up. `reason` is the
 * structured code (see not-connected-reasons.ts); `remark` is the display
 * text — the matching preset label, or the BPM's own text for "other"
 * (2026-10-20, so the common cases are countable without parsing free
 * text). */
export async function markNotConnected(
  id: number,
  branch: string,
  performedBy: string,
  reason: string,
  remark: string,
): Promise<void> {
  await assertOwnedByBranch(id, branch);
  await pool.query(`update bp_referrals set call_status = 'not_connected', last_contacted_at = now() where id = $1`, [id]);
  await logActivity(id, "not_connected", remark, performedBy, reason);
}

/** Hours after which a validated (genuine + interested) referral with no
 * contact needs a follow-up — 2026-10-15, down from 3 days at the user's
 * request, since the car hasn't come in yet and the lead can go cold fast. */
export const FOLLOW_UP_OVERDUE_HOURS = 24;

/** Hours after which an unconnected referral (never reached, or reached but
 * not yet resolved) needs its first nudge — 2026-10-15. Paired with
 * UNCONNECTED_DROP_DAYS below: past that many days with still no contact,
 * it's no longer "overdue", it's dropped (see classify() in
 * bpm-queue-client.tsx and bp-ho-analytics-client.tsx, which apply this
 * same window client-side from data already on the page). */
export const UNCONNECTED_REMINDER_HOURS = 2;
export const UNCONNECTED_DROP_DAYS = 3;

/** Validated (genuine + interested) referrals the BPM hasn't checked in on
 * for FOLLOW_UP_OVERDUE_HOURS+ and the car still hasn't come in — the
 * follow-up popup's data source (see bp-followup-popup-gate.tsx).
 * last_contacted_at is the clock: set when the call outcome is first
 * recorded, and bumped again by logFollowUpContact below every time the
 * BPM re-contacts the customer. */
export async function loadOverdueFollowUps(branch: string): Promise<BpReferralRow[]> {
  const { rows } = await pool.query<BpReferralRow>(
    `select ${SELECT_COLUMNS} from bp_referrals r ${LATEST_TRANSFER_JOIN}
     where r.assigned_branch = $1 and r.genuine = true and r.customer_interested = true
       and r.closed_at is null and r.ro_matched_at is null and r.pending_ro_no is null
       and r.last_contacted_at <= now() - interval '${FOLLOW_UP_OVERDUE_HOURS} hours'
     order by r.last_contacted_at asc`,
    [branch],
  );
  return rows;
}

/** A referral never yet connected (still "to call" or "not connected"),
 * UNCONNECTED_REMINDER_HOURS+ since it last had any attempt (or since
 * submission if never attempted), and not yet past the drop window — the
 * urgent-contact popup's data source (see bp-urgent-contact-popup-gate.tsx).
 * Once past UNCONNECTED_DROP_DAYS it's dropped instead (classify() in the
 * UI treats that as its own bucket, no longer "needs a reminder"). */
export async function loadUrgentUnconnected(branch: string): Promise<BpReferralRow[]> {
  const { rows } = await pool.query<BpReferralRow>(
    `select ${SELECT_COLUMNS} from bp_referrals r ${LATEST_TRANSFER_JOIN}
     where r.assigned_branch = $1 and r.call_status in ('pending', 'not_connected')
       and r.closed_at is null and r.validated_at is null
       and coalesce(r.last_contacted_at, r.submitted_at) <= now() - interval '${UNCONNECTED_REMINDER_HOURS} hours'
       and coalesce(r.last_contacted_at, r.submitted_at) > now() - interval '${UNCONNECTED_DROP_DAYS} days'
     order by coalesce(r.last_contacted_at, r.submitted_at) asc`,
    [branch],
  );
  return rows;
}

/** BPM re-contacted the customer on an already-validated referral — resets
 * the follow-up clock without touching anything else recorded about the
 * call. */
export async function logFollowUpContact(id: number, branch: string, performedBy: string, remark: string): Promise<void> {
  await assertOwnedByBranch(id, branch);
  await pool.query(`update bp_referrals set last_contacted_at = now() where id = $1`, [id]);
  await logActivity(id, "follow_up", remark, performedBy);
}

/** BPM closes out a validated (genuine + interested) referral as "Lost" —
 * the customer took the car elsewhere instead of bringing it in, so there's
 * no point following up any further (2026-10-27, the user's request). Only
 * valid while the referral is still open and unmatched — once an RO is
 * entered or matched the case is already done, and a closed case can't be
 * closed again. validated_at is left untouched, so the referring employee
 * keeps their ₹50 validation payout, same precedent as not_interested. */
export async function closeFollowUpAsLost(id: number, branch: string, performedBy: string, lostReason: string): Promise<void> {
  await assertOwnedByBranch(id, branch);
  const { rows } = await pool.query<{
    validated_at: Date | string | null;
    closed_at: Date | string | null;
    ro_matched_at: Date | string | null;
    pending_ro_no: string | null;
  }>(`select validated_at, closed_at, ro_matched_at, pending_ro_no from bp_referrals where id = $1`, [id]);
  const referral = rows[0];
  if (!referral || !referral.validated_at || referral.closed_at || referral.ro_matched_at || referral.pending_ro_no) {
    throw new Error("This referral isn't open for a Lost close-out.");
  }
  await pool.query(
    `update bp_referrals set closed_at = now(), closed_reason = 'lost', lost_reason = $2, handled_by = $3 where id = $1`,
    [id, lostReason, performedBy],
  );
  await logActivity(id, "lost", lostReason, performedBy);
}

export type ActivityRow = {
  id: number;
  activityType: "not_connected" | "call_outcome" | "follow_up" | "ro_entered" | "lost";
  remark: string;
  notConnectedReason: string | null;
  performedBy: string;
  performedAt: Date | string;
};

/** Full action history for one referral — every not-connected attempt,
 * the call outcome, and every follow-up, each with its own remark — for
 * the detail view's "History" section. */
export async function loadActivityForReferral(referralId: number): Promise<ActivityRow[]> {
  const { rows } = await pool.query<{
    id: number;
    activity_type: "not_connected" | "call_outcome" | "follow_up" | "ro_entered";
    remark: string;
    not_connected_reason: string | null;
    performed_by: string;
    performed_at: Date | string;
  }>(
    `select id, activity_type, remark, not_connected_reason, performed_by, performed_at from bp_referral_activity
     where referral_id = $1 order by performed_at desc`,
    [referralId],
  );
  return rows.map((r) => ({
    id: r.id,
    activityType: r.activity_type,
    remark: r.remark,
    notConnectedReason: r.not_connected_reason,
    performedBy: r.performed_by,
    performedAt: r.performed_at,
  }));
}

export type CallOutcome =
  | { genuine: false }
  | { genuine: true; estimateAmount: number; customerInterested: false; notInterestedReason: string }
  | { genuine: true; estimateAmount: number; customerInterested: true; paymentType: "CP" | "IP" };

/** The one-form submission once a BPM actually connects with the customer —
 * genuine/estimate/interested/CP-IP all recorded together, plus a mandatory
 * remark explaining the outcome (the damage description when genuine, the
 * reason when not). Genuine-but-not-interested additionally requires its
 * own structured not_interested_reason (2026-10-17, the user's call) —
 * distinct from the remark, so BP HO can see at a glance why a customer
 * declined.
 *
 * Not genuine closes the referral out with zero payout — the lead itself
 * was never real, so nothing is owed. Genuine-but-not-interested ALSO
 * closes it out (no follow-up — they're not bringing the car in), but the
 * referring employee still earns the ₹50 validation payout, since the lead
 * itself was genuine regardless of what the customer decided (2026-10-15,
 * the user's explicit clarification — validated_at/eligibility_triggered_at
 * fire on genuine alone, not genuine+interested as this read before the
 * fix). Only genuine+interested additionally stays open for the ₹200
 * completion payout once an RO is matched. */
export async function submitCallOutcome(
  id: number,
  branch: string,
  handledBy: string,
  outcome: CallOutcome,
  remark: string,
): Promise<void> {
  await assertOwnedByBranch(id, branch);
  if (!outcome.genuine) {
    await pool.query(
      `update bp_referrals set call_status = 'connected', genuine = false, handled_by = $2,
         last_contacted_at = now(), closed_at = now(), closed_reason = 'not_genuine'
       where id = $1`,
      [id, handledBy],
    );
  } else if (!outcome.customerInterested) {
    await pool.query(
      `update bp_referrals set call_status = 'connected', genuine = true, estimate_amount = $3,
         customer_interested = false, not_interested_reason = $4, handled_by = $2,
         last_contacted_at = now(), closed_at = now(), closed_reason = 'not_interested',
         validated_at = now(), eligibility_triggered_at = now()
       where id = $1`,
      [id, handledBy, outcome.estimateAmount, outcome.notInterestedReason],
    );
  } else {
    await pool.query(
      `update bp_referrals set call_status = 'connected', genuine = true, estimate_amount = $3,
         customer_interested = true, payment_type = $4, handled_by = $2,
         last_contacted_at = now(), validated_at = now(), eligibility_triggered_at = now()
       where id = $1`,
      [id, handledBy, outcome.estimateAmount, outcome.paymentType],
    );
  }
  await logActivity(id, "call_outcome", remark, handledBy);
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

/** BPM types in the actual RO number against their own queue entry
 * (2026-10-26, the user's call — replaces the old blind vehicle-reg-no-only
 * auto-match as the ₹200 completion trigger). Checked immediately against
 * everything already uploaded (raw_upload_rows, report_type 'ssrv089_bp',
 * BPJ-prefixed) — completes right away ("completed") if that RO's VehRegNo
 * matches this referral's own vehicle_reg_no. If the RO isn't in any upload
 * yet, it's saved as pending_ro_no ("pending") and the same upload-triggered
 * matcher that handles a fresh upload (see ro-matcher.ts) picks it up once
 * it lands — the BPM never has to re-enter it. If the RO IS found but
 * against a different vehicle, rejected outright with nothing saved, so a
 * mistyped RO can't silently misattribute a payout. */
export async function enterRoNumber(id: number, branch: string, enteredBy: string, roNo: string): Promise<"completed" | "pending"> {
  await assertOwnedByBranch(id, branch);

  const { rows } = await pool.query<{
    genuine: boolean | null;
    customer_interested: boolean | null;
    closed_at: Date | string | null;
    ro_matched_at: Date | string | null;
    vehicle_reg_no: string | null;
  }>(`select genuine, customer_interested, closed_at, ro_matched_at, vehicle_reg_no from bp_referrals where id = $1`, [id]);
  const referral = rows[0];
  if (!referral || !referral.genuine || !referral.customer_interested || referral.closed_at || referral.ro_matched_at) {
    throw new Error("This referral isn't open for an RO entry.");
  }
  if (!referral.vehicle_reg_no) {
    throw new Error("This referral has no vehicle registration number on record.");
  }

  const normalizedRo = roNo.trim().toUpperCase();
  const normalizedReg = referral.vehicle_reg_no.trim().toUpperCase().replace(/[\s-]/g, "");

  const { rows: uploaded } = await pool.query<{ veh_reg_no: string | null }>(
    `select row_data->>'VehRegNo' as veh_reg_no from raw_upload_rows
     where report_type = 'ssrv089_bp' and upper(coalesce(row_data->>'JobOrder No', '')) = $1
     limit 1`,
    [normalizedRo],
  );

  if (uploaded.length > 0) {
    const uploadedReg = String(uploaded[0].veh_reg_no ?? "").toUpperCase().replace(/[\s-]/g, "");
    if (uploadedReg !== normalizedReg) {
      throw new Error("That RO is recorded against a different vehicle — check the number and try again.");
    }
    await pool.query(
      `update bp_referrals set matched_ro_no = $2, ro_matched_at = now(), completion_triggered_at = now(), pending_ro_no = null
       where id = $1`,
      [id, normalizedRo],
    );
    await logActivity(id, "ro_entered", `RO entered: ${normalizedRo} (confirmed)`, enteredBy);
    return "completed";
  }

  await pool.query(
    `update bp_referrals set pending_ro_no = $2, pending_ro_entered_at = now(), pending_ro_entered_by = $3 where id = $1`,
    [id, normalizedRo, enteredBy],
  );
  await logActivity(id, "ro_entered", `RO entered: ${normalizedRo} (pending confirmation)`, enteredBy);
  return "pending";
}

/** Read-only, for a BPM whose own employee's referral got transferred
 * elsewhere (2026-10-17, the user's call) — the employee still belongs to
 * this branch, so the branch keeps visibility into how it turns out even
 * though another branch now owns the actual work. "Origin branch" is the
 * from_branch of the EARLIEST transfer a referral ever had (correctly
 * handles a referral transferred more than once — it's always the first
 * hop's origin that matters here, not any intermediate stop), excluding
 * anything that's since made its way back to this same branch. */
export async function loadTransferredOutFromBranch(branch: string): Promise<BpReferralRow[]> {
  const { rows } = await pool.query<BpReferralRow>(
    `select ${SELECT_COLUMNS} from bp_referrals r ${LATEST_TRANSFER_JOIN}
     join (
       select distinct on (referral_id) referral_id, from_branch
       from bp_referral_transfers
       order by referral_id, transferred_at asc
     ) origin on origin.referral_id = r.id
     where origin.from_branch = $1 and r.assigned_branch <> $1
     order by r.submitted_at desc`,
    [branch],
  );
  return rows;
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
  lost: number;
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
    lost: string;
    pending: string;
  }>(
    `select assigned_branch,
            count(*) as total,
            count(*) filter (where validated_at is not null) as validated,
            count(*) filter (where ro_matched_at is not null) as completed,
            count(*) filter (where closed_reason = 'not_genuine') as not_genuine,
            count(*) filter (where closed_reason = 'not_interested') as not_interested,
            count(*) filter (where closed_reason = 'lost') as lost,
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
    lost: Number(r.lost),
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

