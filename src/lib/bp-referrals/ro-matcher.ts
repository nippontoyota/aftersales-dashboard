import { pool } from "@/lib/db";
import { normalizeRoNo, normalizeRegNo } from "./ro-normalize";

const BPJ_PREFIX = "BPJ";

export type MatchedBpReferral = { id: number; vehicleRegNo: string; roNo: string };

/**
 * Scans a newly uploaded Cost & Sales Report - BP's rows (JobOrder No /
 * VehRegNo columns — see ssrv089-bp/parse.ts) for BPJ-prefixed ROs and
 * confirms any BPM-entered pending RO number against them (2026-10-26 — the
 * user's call: a BPM now types the actual RO number in against their own
 * queue entry, see store.ts's enterRoNumber(), rather than the system
 * guessing a match off vehicle reg no alone). Requires BOTH the RO number
 * the BPM entered AND the referral's own vehicle reg no to match this
 * upload's row.
 *
 * Scoped to the uploading branch's own currently-assigned referrals
 * (2026-11-11, fixing a real bug: the DMS's "BPJ" job order numbers turned
 * out to be a per-branch counter, not company-wide-unique — the exact same
 * literal RO string recurs for unrelated vehicles at different branches, so
 * matching company-wide could in principle pick up the wrong branch's job.
 * A transferred referral (store.ts's transferReferral) still matches
 * correctly under this scoping, since assigned_branch moves with the
 * transfer to wherever the car actually ends up getting serviced).
 *
 * Stamps matched_ro_no/ro_matched_at/completion_triggered_at — the ₹200
 * payout point, and the trigger the user's own "referral completed"
 * WhatsApp automation hooks off of. Best-effort: the caller must never let
 * a failure here block the upload it's attached to.
 */
export async function matchBpReferralsFromCostSalesBpRows(rows: Record<string, unknown>[], branch: string): Promise<MatchedBpReferral[]> {
  const roToReg = new Map<string, string>();
  for (const row of rows) {
    const jobOrderNo = String(row["JobOrder No"] ?? "").trim();
    if (!jobOrderNo.toUpperCase().startsWith(BPJ_PREFIX)) continue;
    const vehRegNo = String(row["VehRegNo"] ?? "").trim();
    if (!vehRegNo) continue;
    roToReg.set(normalizeRoNo(jobOrderNo), normalizeRegNo(vehRegNo));
  }
  if (roToReg.size === 0) return [];

  const { rows: candidates } = await pool.query<{ id: number; vehicle_reg_no: string | null; pending_ro_no: string | null }>(
    `select id, vehicle_reg_no, pending_ro_no from bp_referrals
     where genuine = true and customer_interested = true
       and closed_at is null and ro_matched_at is null
       and pending_ro_no is not null and pending_ro_no <> ''
       and assigned_branch = $1`,
    [branch],
  );

  const matched: MatchedBpReferral[] = [];
  for (const candidate of candidates) {
    const uploadedReg = roToReg.get(normalizeRoNo(String(candidate.pending_ro_no)));
    if (!uploadedReg) continue;
    if (uploadedReg !== normalizeRegNo(candidate.vehicle_reg_no ?? "")) continue;
    await pool.query(
      `update bp_referrals set matched_ro_no = pending_ro_no, ro_matched_at = now(), completion_triggered_at = now()
       where id = $1`,
      [candidate.id],
    );
    matched.push({ id: candidate.id, vehicleRegNo: candidate.vehicle_reg_no ?? "", roNo: candidate.pending_ro_no! });
  }
  return matched;
}

/**
 * Backstop for the upload-triggered matcher above — BP HO's own "re-scan"
 * button (2026-10-15, repurposed 2026-10-26), for the case where a BPM's
 * pending RO never got confirmed (the upload landed before the RO was
 * entered and the per-upload matcher above never saw it, or a matcher run
 * failed silently). Same RO+reg-no match as above, scoped per-branch the
 * same way and for the same reason (2026-11-11) — done as a plain Node loop
 * rather than one set-based SQL UPDATE (how this used to work) specifically
 * so the per-branch scoping and the leading-zero-aware reg comparison
 * (normalizeRegNo, JS-only — see ro-normalize.ts) both apply uniformly;
 * pulling every ssrv089_bp row's two small text fields into memory is cheap
 * even at this table's size, and this only ever runs on a manual click.
 */
export async function rescanUnmatchedReferrals(): Promise<MatchedBpReferral[]> {
  const { rows: candidates } = await pool.query<{
    id: number;
    vehicle_reg_no: string | null;
    pending_ro_no: string | null;
    assigned_branch: string | null;
  }>(
    `select id, vehicle_reg_no, pending_ro_no, assigned_branch from bp_referrals
     where genuine = true and customer_interested = true
       and closed_at is null and ro_matched_at is null
       and pending_ro_no is not null and pending_ro_no <> ''`,
  );
  if (candidates.length === 0) return [];

  const { rows: uploadRows } = await pool.query<{ branch: string; job_order_no: string | null; veh_reg_no: string | null }>(
    `select branch, row_data->>'JobOrder No' as job_order_no, row_data->>'VehRegNo' as veh_reg_no
     from raw_upload_rows
     where report_type = 'ssrv089_bp'
       and upper(coalesce(row_data->>'JobOrder No', '')) like 'BPJ%'
       and coalesce(row_data->>'VehRegNo', '') <> ''
     order by uploaded_at asc`,
  );
  // branch+RO -> reg, last (most recent) upload wins on a collision.
  const byBranchAndRo = new Map<string, string>();
  for (const row of uploadRows) {
    if (!row.job_order_no || !row.veh_reg_no) continue;
    byBranchAndRo.set(`${row.branch}::${normalizeRoNo(row.job_order_no)}`, normalizeRegNo(row.veh_reg_no));
  }

  const matched: MatchedBpReferral[] = [];
  for (const candidate of candidates) {
    if (!candidate.assigned_branch || !candidate.vehicle_reg_no || !candidate.pending_ro_no) continue;
    const uploadedReg = byBranchAndRo.get(`${candidate.assigned_branch}::${normalizeRoNo(candidate.pending_ro_no)}`);
    if (!uploadedReg) continue;
    if (uploadedReg !== normalizeRegNo(candidate.vehicle_reg_no)) continue;
    await pool.query(
      `update bp_referrals set matched_ro_no = pending_ro_no, ro_matched_at = now(), completion_triggered_at = now()
       where id = $1`,
      [candidate.id],
    );
    matched.push({ id: candidate.id, vehicleRegNo: candidate.vehicle_reg_no, roNo: candidate.pending_ro_no });
  }
  return matched;
}
