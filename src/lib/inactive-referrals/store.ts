import { pool } from "@/lib/db";
import { listBranchCodes } from "@/lib/admin-store";
import { resolveBranchCodeByName } from "@/lib/bp-referrals/branch-match";
import { regionForBranch, type RegionName } from "@/lib/regions";
import { normalizeRoNo } from "./ro-normalize";

export type InactiveReferralRow = {
  id: number;
  referralDate: string | null;
  vehicleRegNo: string;
  vehicleModel: string;
  customerName: string;
  customerPhone1: string;
  customerPhone2: string | null;
  customerAddress: string | null;
  referringEmployeeId: string;
  referringEmployeeName: string | null;
  referringEmployeeBranch: string | null;
  dealerCode: string | null;
  submittedAt: Date | string | null;
  assignedBranch: string | null;
  callStatus: "pending" | "not_connected" | "connected";
  handledBy: string | null;
  lastContactedAt: Date | string | null;
  genuine: boolean | null;
  customerInterested: boolean | null;
  validatedAt: Date | string | null;
  closedAt: Date | string | null;
  closedReason: "not_genuine" | "not_interested" | null;
  appointmentDate: string | null;
  pendingRoNo: string | null;
  pendingRoEnteredAt: Date | string | null;
  matchedRoNo: string | null;
  roMatchedAt: Date | string | null;
};

const SELECT_COLUMNS = `
  id, referral_date, vehicle_reg_no, vehicle_model, customer_name, customer_phone_1, customer_phone_2,
  customer_address, referring_employee_id, referring_employee_name, referring_employee_branch, dealer_code,
  submitted_at, assigned_branch, call_status, handled_by, last_contacted_at,
  genuine, customer_interested, validated_at, closed_at, closed_reason,
  appointment_date::text as appointment_date, pending_ro_no, pending_ro_entered_at, matched_ro_no, ro_matched_at
`;

type RawReferralRow = {
  id: number;
  referral_date: string | null;
  vehicle_reg_no: string;
  vehicle_model: string;
  customer_name: string;
  customer_phone_1: string;
  customer_phone_2: string | null;
  customer_address: string | null;
  referring_employee_id: string;
  referring_employee_name: string | null;
  referring_employee_branch: string | null;
  dealer_code: string | null;
  submitted_at: Date | string | null;
  assigned_branch: string | null;
  call_status: "pending" | "not_connected" | "connected";
  handled_by: string | null;
  last_contacted_at: Date | string | null;
  genuine: boolean | null;
  customer_interested: boolean | null;
  validated_at: Date | string | null;
  closed_at: Date | string | null;
  closed_reason: "not_genuine" | "not_interested" | null;
  appointment_date: string | null;
  pending_ro_no: string | null;
  pending_ro_entered_at: Date | string | null;
  matched_ro_no: string | null;
  ro_matched_at: Date | string | null;
};

function toRow(r: RawReferralRow): InactiveReferralRow {
  return {
    id: r.id,
    referralDate: r.referral_date,
    vehicleRegNo: r.vehicle_reg_no,
    vehicleModel: r.vehicle_model,
    customerName: r.customer_name,
    customerPhone1: r.customer_phone_1,
    customerPhone2: r.customer_phone_2,
    customerAddress: r.customer_address,
    referringEmployeeId: r.referring_employee_id,
    referringEmployeeName: r.referring_employee_name,
    referringEmployeeBranch: r.referring_employee_branch,
    dealerCode: r.dealer_code,
    submittedAt: r.submitted_at,
    assignedBranch: r.assigned_branch,
    callStatus: r.call_status,
    handledBy: r.handled_by,
    lastContactedAt: r.last_contacted_at,
    genuine: r.genuine,
    customerInterested: r.customer_interested,
    validatedAt: r.validated_at,
    closedAt: r.closed_at,
    closedReason: r.closed_reason,
    appointmentDate: r.appointment_date,
    pendingRoNo: r.pending_ro_no,
    pendingRoEnteredAt: r.pending_ro_entered_at,
    matchedRoNo: r.matched_ro_no,
    roMatchedAt: r.ro_matched_at,
  };
}

/** Resolves and persists assigned_branch for any referral the webhook
 * inserted without one, or whose stored value isn't a real branch code —
 * same self-healing convention as bp-referrals/store.ts's
 * ensureAssignedBranches(). */
export async function ensureAssignedBranches(): Promise<void> {
  const validCodes = await listBranchCodes();
  const { rows } = await pool.query<{ id: number; referring_employee_branch: string | null; dealer_code: string | null }>(
    `select id, referring_employee_branch, dealer_code from inactive_customer_referrals
     where assigned_branch is null or assigned_branch <> all($1::text[])`,
    [validCodes],
  );
  for (const row of rows) {
    const resolved = resolveBranchCodeByName(row.referring_employee_branch) ?? resolveBranchCodeByName(row.dealer_code);
    if (resolved && validCodes.includes(resolved)) {
      await pool.query(`update inactive_customer_referrals set assigned_branch = $1 where id = $2`, [resolved, row.id]);
    }
  }
}

export async function loadQueueForBranch(branch: string): Promise<InactiveReferralRow[]> {
  const { rows } = await pool.query<RawReferralRow>(
    `select ${SELECT_COLUMNS} from inactive_customer_referrals where assigned_branch = $1 order by submitted_at desc`,
    [branch],
  );
  return rows.map(toRow);
}

/** HQ's read-only company-wide view — every referral, newest first. */
export async function loadAllReferrals(): Promise<InactiveReferralRow[]> {
  const { rows } = await pool.query<RawReferralRow>(`select ${SELECT_COLUMNS} from inactive_customer_referrals order by submitted_at desc`);
  return rows.map(toRow);
}

async function assertOwnedByBranch(id: number, branch: string): Promise<void> {
  const { rows } = await pool.query<{ assigned_branch: string | null }>(
    `select assigned_branch from inactive_customer_referrals where id = $1`,
    [id],
  );
  if (!rows[0] || rows[0].assigned_branch !== branch) {
    throw new Error("This referral isn't assigned to your branch.");
  }
}

async function logCall(
  referralId: number,
  callStatus: "not_connected" | "connected",
  remark: string,
  performedBy: string,
  notConnectedReason?: string,
): Promise<void> {
  await pool.query(
    `insert into inactive_referral_calls (referral_id, call_status, remark, performed_by, not_connected_reason) values ($1, $2, $3, $4, $5)`,
    [referralId, callStatus, remark, performedBy, notConnectedReason ?? null],
  );
}

export async function markNotConnected(id: number, branch: string, performedBy: string, remark: string, reason: string): Promise<void> {
  await assertOwnedByBranch(id, branch);
  await pool.query(
    `update inactive_customer_referrals set call_status = 'not_connected', handled_by = $2, last_contacted_at = now() where id = $1`,
    [id, performedBy],
  );
  await logCall(id, "not_connected", remark, performedBy, reason);
}

export type CallOutcome =
  | { genuine: false }
  | { genuine: true; customerInterested: false }
  | { genuine: true; customerInterested: true; appointmentDate?: string };

/** The call-outcome submission once a branch actually connects with the
 * customer. genuine alone is the ₹50 payout trigger (validated_at) — the
 * user's explicit call: paid once the call confirms this really is an
 * inactive customer worth it, regardless of whether they agree to come in.
 * genuine=false or genuine+not-interested both close the referral out
 * (closed_at/closed_reason) with no further follow-up; genuine+interested
 * stays open. appointmentDate is captured right here when the branch
 * already has one off the call (2026-11-27, at the user's request — the
 * form has a date picker right where "interested" is answered, rather
 * than making the branch reopen the referral for a separate step); left
 * blank it falls back to "Set appointment date" on the Connected stage,
 * for when a customer agrees "in principle" but can't commit a date on
 * the spot. A genuine outcome also writes a row to
 * verified_inactive_contacts — the user's explicit request that a verified-
 * genuine inactive customer's number "enters our database". */
export async function submitCallOutcome(id: number, branch: string, handledBy: string, outcome: CallOutcome, remark: string): Promise<void> {
  await assertOwnedByBranch(id, branch);
  if (!outcome.genuine) {
    await pool.query(
      `update inactive_customer_referrals set call_status = 'connected', genuine = false, handled_by = $2,
         last_contacted_at = now(), closed_at = now(), closed_reason = 'not_genuine'
       where id = $1`,
      [id, handledBy],
    );
  } else if (!outcome.customerInterested) {
    await pool.query(
      `update inactive_customer_referrals set call_status = 'connected', genuine = true, customer_interested = false,
         handled_by = $2, last_contacted_at = now(), validated_at = now(),
         closed_at = now(), closed_reason = 'not_interested'
       where id = $1`,
      [id, handledBy],
    );
  } else {
    await pool.query(
      `update inactive_customer_referrals set call_status = 'connected', genuine = true, customer_interested = true,
         handled_by = $2, last_contacted_at = now(), validated_at = now(), appointment_date = coalesce($3::date, appointment_date)
       where id = $1`,
      [id, handledBy, outcome.appointmentDate ?? null],
    );
  }
  await logCall(id, "connected", remark, handledBy);

  if (outcome.genuine) {
    await pool.query(
      `insert into verified_inactive_contacts (referral_id, customer_name, customer_phone_1, customer_phone_2, vehicle_reg_no, vehicle_model, branch)
       select id, customer_name, customer_phone_1, customer_phone_2, vehicle_reg_no, vehicle_model, assigned_branch
       from inactive_customer_referrals where id = $1
       on conflict (referral_id) do nothing`,
      [id],
    );
  }
}

/** Branch sets (or re-sets, on reschedule after a no-show) the date the
 * customer agreed to come in. Overwrites rather than versions
 * appointment_date — the user's explicit call: a reschedule just logs a
 * new call entry and replaces the date, no appointment history table. */
export async function setAppointmentDate(id: number, branch: string, performedBy: string, appointmentDate: string, remark: string): Promise<void> {
  await assertOwnedByBranch(id, branch);
  const { rows } = await pool.query<{ genuine: boolean | null; customer_interested: boolean | null; closed_at: Date | string | null }>(
    `select genuine, customer_interested, closed_at from inactive_customer_referrals where id = $1`,
    [id],
  );
  const referral = rows[0];
  if (!referral || !referral.genuine || !referral.customer_interested || referral.closed_at) {
    throw new Error("This referral isn't open for an appointment date.");
  }
  await pool.query(
    `update inactive_customer_referrals set appointment_date = $2, last_contacted_at = now() where id = $1`,
    [id, appointmentDate],
  );
  await logCall(id, "connected", remark, performedBy);
}

/** Branch types in the actual RO number once the customer visits — the
 * ₹200 completion trigger once verified against a GS Service Info upload
 * (see ro-matcher.ts). Checked immediately against everything already
 * uploaded; if not found yet, saved as pending and the next Service Info
 * upload (or HQ's re-scan backstop) confirms it automatically. */
export async function enterRoNumber(id: number, branch: string, enteredBy: string, roNo: string): Promise<"completed" | "pending"> {
  await assertOwnedByBranch(id, branch);

  const { rows } = await pool.query<{ genuine: boolean | null; customer_interested: boolean | null; closed_at: Date | string | null; ro_matched_at: Date | string | null }>(
    `select genuine, customer_interested, closed_at, ro_matched_at from inactive_customer_referrals where id = $1`,
    [id],
  );
  const referral = rows[0];
  if (!referral || !referral.genuine || !referral.customer_interested || referral.closed_at || referral.ro_matched_at) {
    throw new Error("This referral isn't open for an RO entry.");
  }

  const normalizedRo = normalizeRoNo(roNo);

  const { rows: uploaded } = await pool.query<{ found: boolean }>(
    `select true as found from raw_upload_rows
     where report_type = 'service_info' and branch = $1
       and regexp_replace(upper(coalesce(row_data->>'Job Order No', '')), '[\\s-]', '', 'g') = $2
     limit 1`,
    [branch, normalizedRo],
  );

  if (uploaded.length > 0) {
    await pool.query(
      `update inactive_customer_referrals set matched_ro_no = $2, ro_matched_at = now(), pending_ro_no = null where id = $1`,
      [id, normalizedRo],
    );
    await logCall(id, "connected", `RO entered: ${normalizedRo} (confirmed)`, enteredBy);
    return "completed";
  }

  await pool.query(
    `update inactive_customer_referrals set pending_ro_no = $2, pending_ro_entered_at = now() where id = $1`,
    [id, normalizedRo],
  );
  await logCall(id, "connected", `RO entered: ${normalizedRo} (pending confirmation)`, enteredBy);
  return "pending";
}

export type InactiveReferralCallRow = {
  id: number;
  callStatus: "not_connected" | "connected";
  remark: string;
  notConnectedReason: string | null;
  performedBy: string;
  performedAt: Date | string;
};

export async function loadCallHistory(referralId: number): Promise<InactiveReferralCallRow[]> {
  const { rows } = await pool.query<{
    id: number;
    call_status: "not_connected" | "connected";
    remark: string;
    not_connected_reason: string | null;
    performed_by: string;
    performed_at: Date | string;
  }>(
    `select id, call_status, remark, not_connected_reason, performed_by, performed_at from inactive_referral_calls
     where referral_id = $1 order by performed_at desc`,
    [referralId],
  );
  return rows.map((r) => ({
    id: r.id,
    callStatus: r.call_status,
    remark: r.remark,
    notConnectedReason: r.not_connected_reason,
    performedBy: r.performed_by,
    performedAt: r.performed_at,
  }));
}

export type PayoutLedgerRow = {
  employeeId: string | null;
  employeeName: string | null;
  employeeBranch: string | null;
  validatedCount: number;
  completedCount: number;
  amountEarned: number;
  amountPaid: number;
  amountOwed: number;
};

const VALIDATED_PAYOUT = 50;
const COMPLETED_PAYOUT = 200;

/** ₹50 per genuine (validated_at is not null) referral, another ₹200 once
 * its RO is verified (ro_matched_at is not null) — grouped per referring
 * employee, for HQ to action payment manually. Mirrors bp-referrals/
 * store.ts's loadPayoutLedger exactly, including netting off
 * inactive_referral_payouts and dropping anyone fully settled. */
export async function loadPayoutLedger(): Promise<PayoutLedgerRow[]> {
  const { rows } = await pool.query<{
    referring_employee_id: string | null;
    referring_employee_name: string | null;
    referring_employee_branch: string | null;
    validated_count: string;
    completed_count: string;
    paid_amount: string;
  }>(
    `with earned as (
       select referring_employee_id, referring_employee_name, referring_employee_branch,
              count(*) filter (where validated_at is not null) as validated_count,
              count(*) filter (where ro_matched_at is not null) as completed_count
       from inactive_customer_referrals
       where validated_at is not null
       group by referring_employee_id, referring_employee_name, referring_employee_branch
     ),
     paid as (
       select employee_id, employee_name, employee_branch, sum(amount) as paid_amount
       from inactive_referral_payouts
       group by employee_id, employee_name, employee_branch
     )
     select e.*, coalesce(p.paid_amount, 0) as paid_amount
     from earned e
     left join paid p
       on p.employee_id is not distinct from e.referring_employee_id
      and p.employee_name is not distinct from e.referring_employee_name
      and p.employee_branch is not distinct from e.referring_employee_branch`,
  );
  return rows
    .map((r) => {
      const validatedCount = Number(r.validated_count);
      const completedCount = Number(r.completed_count);
      const amountEarned = validatedCount * VALIDATED_PAYOUT + completedCount * COMPLETED_PAYOUT;
      const amountPaid = Number(r.paid_amount);
      return {
        employeeId: r.referring_employee_id,
        employeeName: r.referring_employee_name,
        employeeBranch: r.referring_employee_branch,
        validatedCount,
        completedCount,
        amountEarned,
        amountPaid,
        amountOwed: amountEarned - amountPaid,
      };
    })
    .filter((r) => r.amountOwed > 0)
    .sort((a, b) => b.amountOwed - a.amountOwed);
}

export type PayoutHistoryRow = {
  id: number;
  employeeId: string | null;
  employeeName: string | null;
  employeeBranch: string | null;
  amount: number;
  paidAt: string;
  paidBy: string | null;
};

export async function loadPayoutHistory(limit = 100): Promise<PayoutHistoryRow[]> {
  const { rows } = await pool.query<{
    id: number;
    employee_id: string | null;
    employee_name: string | null;
    employee_branch: string | null;
    amount: string;
    paid_at: string;
    paid_by: string | null;
  }>(
    `select id, employee_id, employee_name, employee_branch, amount, paid_at, paid_by
     from inactive_referral_payouts
     order by paid_at desc
     limit $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id,
    employeeId: r.employee_id,
    employeeName: r.employee_name,
    employeeBranch: r.employee_branch,
    amount: Number(r.amount),
    paidAt: r.paid_at,
    paidBy: r.paid_by,
  }));
}

export async function markPayoutPaid(employeeId: string | null, employeeName: string | null, employeeBranch: string | null, amount: number, paidBy: string): Promise<void> {
  await pool.query(
    `insert into inactive_referral_payouts (employee_id, employee_name, employee_branch, amount, paid_by)
     values ($1, $2, $3, $4, $5)`,
    [employeeId, employeeName, employeeBranch, amount, paidBy],
  );
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

/** Branch/region breakdown for HQ's admin dashboard — grouped by
 * assigned_branch, mirrors bp-referrals/store.ts's loadBranchRollup. */
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
     from inactive_customer_referrals
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
