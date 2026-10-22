import { pool } from "@/lib/db";
import { listBranchCodes } from "@/lib/admin-store";
import { resolveBranchCodeByName } from "@/lib/bp-referrals/branch-match";

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
};

const SELECT_COLUMNS = `
  id, referral_date, vehicle_reg_no, vehicle_model, customer_name, customer_phone_1, customer_phone_2,
  customer_address, referring_employee_id, referring_employee_name, referring_employee_branch, dealer_code,
  submitted_at, assigned_branch, call_status, handled_by, last_contacted_at
`;

function toRow(r: any): InactiveReferralRow {
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
  };
}

/** Resolves and persists assigned_branch for any referral the webhook
 * inserted without one, or whose stored value isn't a real branch code —
 * same self-healing convention as bp-referrals/store.ts's
 * ensureAssignedBranches(). Tries referring_employee_branch first, falling
 * back to dealer_code, since either field may carry the branch's free-text
 * name depending on how the submitting form was filled in. Rows that match
 * neither stay unassigned (invisible to every branch's queue) rather than
 * landing on a guess. */
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
  const { rows } = await pool.query(
    `select ${SELECT_COLUMNS} from inactive_customer_referrals where assigned_branch = $1 order by submitted_at desc`,
    [branch],
  );
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

async function logCall(referralId: number, callStatus: "not_connected" | "connected", remark: string, performedBy: string): Promise<void> {
  await pool.query(
    `insert into inactive_referral_calls (referral_id, call_status, remark, performed_by) values ($1, $2, $3, $4)`,
    [referralId, callStatus, remark, performedBy],
  );
}

export async function markNotConnected(id: number, branch: string, performedBy: string, remark: string): Promise<void> {
  await assertOwnedByBranch(id, branch);
  await pool.query(
    `update inactive_customer_referrals set call_status = 'not_connected', handled_by = $2, last_contacted_at = now() where id = $1`,
    [id, performedBy],
  );
  await logCall(id, "not_connected", remark, performedBy);
}

export async function markConnected(id: number, branch: string, performedBy: string, remark: string): Promise<void> {
  await assertOwnedByBranch(id, branch);
  await pool.query(
    `update inactive_customer_referrals set call_status = 'connected', handled_by = $2, last_contacted_at = now() where id = $1`,
    [id, performedBy],
  );
  await logCall(id, "connected", remark, performedBy);
}

export type InactiveReferralCallRow = {
  id: number;
  callStatus: "not_connected" | "connected";
  remark: string;
  performedBy: string;
  performedAt: Date | string;
};

export async function loadCallHistory(referralId: number): Promise<InactiveReferralCallRow[]> {
  const { rows } = await pool.query<{
    id: number;
    call_status: "not_connected" | "connected";
    remark: string;
    performed_by: string;
    performed_at: Date | string;
  }>(
    `select id, call_status, remark, performed_by, performed_at from inactive_referral_calls
     where referral_id = $1 order by performed_at desc`,
    [referralId],
  );
  return rows.map((r) => ({
    id: r.id,
    callStatus: r.call_status,
    remark: r.remark,
    performedBy: r.performed_by,
    performedAt: r.performed_at,
  }));
}
