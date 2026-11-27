import { pool } from "@/lib/db";
import { normalizeRoNo } from "./ro-normalize";

export type MatchedInactiveReferral = { id: number; roNo: string };

/** Verifies a 3C Referral's branch-entered RO number against a newly
 * uploaded GS Service Info Report (report_type = 'service_info' — the
 * user's explicit call: BP Service Info uploads are out of scope here).
 *
 * Unlike BP Referrals' RO matcher, this can't additionally cross-check the
 * vehicle registration number: the Service Info Report only carries VIN
 * ("Vin no"), never a registration number column, and
 * inactive_customer_referrals has no VIN on file to compare against. So
 * this matches on RO (Job Order No) alone, scoped to the uploading branch
 * — same per-branch scoping rationale as bp-referrals/ro-matcher.ts (job
 * order numbers are a per-branch counter, not company-wide-unique).
 *
 * Stamps matched_ro_no/ro_matched_at — the ₹200 payout trigger (see
 * loadPayoutLedger in store.ts). Best-effort: the caller must never let a
 * failure here block the Service Info upload it's attached to. */
export async function matchInactiveReferralsFromServiceInfoRows(
  rows: Record<string, unknown>[],
  branch: string,
): Promise<MatchedInactiveReferral[]> {
  const uploadedRos = new Set<string>();
  for (const row of rows) {
    const jobOrderNo = String(row["Job Order No"] ?? "").trim();
    if (!jobOrderNo) continue;
    uploadedRos.add(normalizeRoNo(jobOrderNo));
  }
  if (uploadedRos.size === 0) return [];

  const { rows: candidates } = await pool.query<{ id: number; pending_ro_no: string | null }>(
    `select id, pending_ro_no from inactive_customer_referrals
     where genuine = true and pending_ro_no is not null and pending_ro_no <> ''
       and ro_matched_at is null and assigned_branch = $1`,
    [branch],
  );

  const matched: MatchedInactiveReferral[] = [];
  for (const candidate of candidates) {
    const normalized = normalizeRoNo(String(candidate.pending_ro_no));
    if (!uploadedRos.has(normalized)) continue;
    await pool.query(
      `update inactive_customer_referrals set matched_ro_no = pending_ro_no, ro_matched_at = now() where id = $1`,
      [candidate.id],
    );
    matched.push({ id: candidate.id, roNo: candidate.pending_ro_no! });
  }
  return matched;
}

/** Backstop for the upload-triggered matcher above — HQ's own "re-scan"
 * button, for a pending RO whose matching upload landed before it was
 * entered (or a matcher run failed silently). Same RO-only, per-branch
 * match as above, done as a plain Node loop rather than one set-based SQL
 * UPDATE, same reasoning as bp-referrals/ro-matcher.ts's own rescan. */
export async function rescanUnmatchedInactiveReferrals(): Promise<MatchedInactiveReferral[]> {
  const { rows: candidates } = await pool.query<{ id: number; pending_ro_no: string | null; assigned_branch: string | null }>(
    `select id, pending_ro_no, assigned_branch from inactive_customer_referrals
     where genuine = true and pending_ro_no is not null and pending_ro_no <> '' and ro_matched_at is null`,
  );
  if (candidates.length === 0) return [];

  const { rows: uploadRows } = await pool.query<{ branch: string; job_order_no: string | null }>(
    `select branch, row_data->>'Job Order No' as job_order_no
     from raw_upload_rows
     where report_type = 'service_info' and coalesce(row_data->>'Job Order No', '') <> ''`,
  );
  const byBranchAndRo = new Set<string>();
  for (const row of uploadRows) {
    if (!row.job_order_no) continue;
    byBranchAndRo.add(`${row.branch}::${normalizeRoNo(row.job_order_no)}`);
  }

  const matched: MatchedInactiveReferral[] = [];
  for (const candidate of candidates) {
    if (!candidate.assigned_branch || !candidate.pending_ro_no) continue;
    if (!byBranchAndRo.has(`${candidate.assigned_branch}::${normalizeRoNo(candidate.pending_ro_no)}`)) continue;
    await pool.query(
      `update inactive_customer_referrals set matched_ro_no = pending_ro_no, ro_matched_at = now() where id = $1`,
      [candidate.id],
    );
    matched.push({ id: candidate.id, roNo: candidate.pending_ro_no });
  }
  return matched;
}
