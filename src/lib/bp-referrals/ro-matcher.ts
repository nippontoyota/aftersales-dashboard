import { pool } from "@/lib/db";

const BPJ_PREFIX = "BPJ";

/** Vehicle reg numbers can show up differently formatted between the
 * WhatsApp-submitted referral ("KL08AX1507") and the DMS export ("KL-08-AX-
 * 1507" or with stray spaces) — normalize both sides before comparing. */
function normalizeReg(reg: string): string {
  return reg.trim().toUpperCase().replace(/[\s-]/g, "");
}

export type MatchedBpReferral = { id: number; vehicleRegNo: string; roNo: string };

/**
 * Scans a newly uploaded Cost & Sales Report - BP's rows (JobOrder No /
 * VehRegNo columns — see ssrv089-bp/parse.ts) for BPJ-prefixed ROs and
 * matches their vehicle reg number against every validated (genuine +
 * interested) referral with no RO matched yet — vehicle reg number only
 * (2026-10-14, the user's decision), company-wide rather than scoped to the
 * uploading branch, so a referral transferred to a different branch (see
 * store.ts's transferReferral) still matches correctly wherever the car
 * actually ends up getting serviced.
 *
 * Stamps matched_ro_no/ro_matched_at/completion_triggered_at — the ₹200
 * payout point, and the trigger the user's own "referral completed"
 * WhatsApp automation hooks off of. Best-effort: the caller must never let
 * a failure here block the upload it's attached to.
 */
export async function matchBpReferralsFromCostSalesBpRows(rows: Record<string, unknown>[]): Promise<MatchedBpReferral[]> {
  const regToRo = new Map<string, string>();
  for (const row of rows) {
    const jobOrderNo = String(row["JobOrder No"] ?? "").trim();
    if (!jobOrderNo.toUpperCase().startsWith(BPJ_PREFIX)) continue;
    const vehRegNo = String(row["VehRegNo"] ?? "").trim();
    if (!vehRegNo) continue;
    // A later row for the same reg no in this file wins — shouldn't happen
    // in practice (one RO per vehicle per day), but keeps this deterministic.
    regToRo.set(normalizeReg(vehRegNo), jobOrderNo);
  }
  if (regToRo.size === 0) return [];

  const { rows: candidates } = await pool.query<{ id: number; vehicle_reg_no: string | null }>(
    `select id, vehicle_reg_no from bp_referrals
     where genuine = true and customer_interested = true
       and closed_at is null and ro_matched_at is null
       and vehicle_reg_no is not null and vehicle_reg_no <> ''`,
  );

  const matched: MatchedBpReferral[] = [];
  for (const candidate of candidates) {
    const roNo = regToRo.get(normalizeReg(candidate.vehicle_reg_no ?? ""));
    if (!roNo) continue;
    await pool.query(
      `update bp_referrals set matched_ro_no = $2, ro_matched_at = now(), completion_triggered_at = now() where id = $1`,
      [candidate.id, roNo],
    );
    matched.push({ id: candidate.id, vehicleRegNo: candidate.vehicle_reg_no ?? "", roNo });
  }
  return matched;
}
