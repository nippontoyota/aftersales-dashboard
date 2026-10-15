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

/**
 * Backstop for the upload-triggered matcher above — BP HO's own "re-scan"
 * button (2026-10-15), for the case where a BPJ RO never got picked up
 * (an upload landed before a referral was validated, a matcher run failed
 * silently, etc.). Does the same reg-no match, but sourced from every
 * Cost & Sales Report - BP row ever saved (raw_upload_rows, report_type
 * 'ssrv089_bp') instead of one upload's in-memory rows — a single set-based
 * UPDATE rather than looping in Node, so scanning the whole history stays
 * cheap even as that table grows. Manually triggered only, never scheduled.
 */
export async function rescanUnmatchedReferrals(): Promise<MatchedBpReferral[]> {
  const { rows } = await pool.query<{ id: number; vehicle_reg_no: string | null; ro_no: string }>(
    `update bp_referrals r
     set matched_ro_no = sub.ro_no, ro_matched_at = now(), completion_triggered_at = now()
     from (
       select distinct on (normalized_reg) normalized_reg, ro_no
       from (
         select
           upper(regexp_replace(row_data->>'VehRegNo', '[\\s-]', '', 'g')) as normalized_reg,
           row_data->>'JobOrder No' as ro_no
         from raw_upload_rows
         where report_type = 'ssrv089_bp'
           and upper(coalesce(row_data->>'JobOrder No', '')) like 'BPJ%'
           and coalesce(row_data->>'VehRegNo', '') <> ''
       ) x
       order by normalized_reg
     ) sub
     where r.genuine = true and r.customer_interested = true
       and r.closed_at is null and r.ro_matched_at is null
       and r.vehicle_reg_no is not null and r.vehicle_reg_no <> ''
       and upper(regexp_replace(r.vehicle_reg_no, '[\\s-]', '', 'g')) = sub.normalized_reg
     returning r.id, r.vehicle_reg_no, sub.ro_no`,
  );
  return rows.map((r) => ({ id: r.id, vehicleRegNo: r.vehicle_reg_no ?? "", roNo: r.ro_no }));
}
