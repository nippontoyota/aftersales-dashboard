import { pool } from "../db";

/**
 * A flagged (stale/after_kpi_cutoff — see reconcile.ts) cancellation needs
 * the branch, then its regional manager, to say why it's still unresolved —
 * the user's explicit call (2026-10-07), to discourage branches cancelling
 * bills freely with no accountability. Branch submits first; the row isn't
 * "resolved" until the regional manager has separately co-signed their own
 * note on top of it. HQ can see everything here but has no required action
 * of their own.
 *
 * Grace period: 3 days from the cancellation's own cancel_at/cancel_date —
 * past that, still unresolved, it's "overdue" (surfaced to HQ via
 * cancellation-flag.tsx, reusing the same reconcile call that component
 * already makes for the latest month rather than adding a new company-wide
 * query on every page load).
 */
export type BranchResolution = "ro_cancelled" | "still_not_closed";
export type RegionalDecision = "approved" | "rejected";

export type CancellationJustification = {
  docNo: string;
  branch: string;
  branchNote: string | null;
  branchResolution: BranchResolution | null;
  branchNewRo: string | null;
  branchSubmittedBy: string | null;
  branchSubmittedAt: string | null;
  regionalNote: string | null;
  regionalDecision: RegionalDecision | null;
  regionalSubmittedBy: string | null;
  regionalSubmittedAt: string | null;
};

/** 'rejected' lets the branch edit and resubmit — see submitBranchJustification,
 * which clears every regional_* field on a branch edit, so a resubmission
 * always goes back to 'branch_submitted' for a fresh regional look. */
export type JustificationStatus = "none" | "branch_submitted" | "resolved" | "rejected";

export function justificationStatus(j: CancellationJustification | undefined): JustificationStatus {
  if (!j || !j.branchSubmittedAt) return "none";
  if (!j.regionalSubmittedAt) return "branch_submitted";
  return j.regionalDecision === "rejected" ? "rejected" : "resolved";
}

const GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000;

/** Past the 3-day grace period from cancellation, still unresolved. Only
 * meaningful for a flagged cancellation — the caller checks that first
 * (reconcile.ts's `flagged`), since an ordinary replaced/adjusted
 * cancellation never needs a justification at all. */
export function isJustificationOverdue(cancelAt: string, j: CancellationJustification | undefined): boolean {
  if (justificationStatus(j) === "resolved") return false;
  return Date.now() - new Date(cancelAt).getTime() > GRACE_PERIOD_MS;
}

function mapRow(r: {
  doc_no: string;
  branch: string;
  branch_note: string | null;
  branch_resolution: BranchResolution | null;
  branch_new_ro: string | null;
  branch_submitted_by: string | null;
  branch_submitted_at: string | null;
  regional_note: string | null;
  regional_decision: RegionalDecision | null;
  regional_submitted_by: string | null;
  regional_submitted_at: string | null;
}): CancellationJustification {
  return {
    docNo: r.doc_no,
    branch: r.branch,
    branchNote: r.branch_note,
    branchResolution: r.branch_resolution,
    branchNewRo: r.branch_new_ro,
    branchSubmittedBy: r.branch_submitted_by,
    branchSubmittedAt: r.branch_submitted_at,
    regionalNote: r.regional_note,
    regionalDecision: r.regional_decision,
    regionalSubmittedBy: r.regional_submitted_by,
    regionalSubmittedAt: r.regional_submitted_at,
  };
}

/** Keyed by doc_no (globally unique — invoice_cancellations' own primary key). */
export async function loadJustifications(docNos: string[]): Promise<Map<string, CancellationJustification>> {
  if (docNos.length === 0) return new Map();
  const { rows } = await pool.query<{
    doc_no: string;
    branch: string;
    branch_note: string | null;
    branch_resolution: BranchResolution | null;
    branch_new_ro: string | null;
    branch_submitted_by: string | null;
    branch_submitted_at: string | null;
    regional_note: string | null;
    regional_decision: RegionalDecision | null;
    regional_submitted_by: string | null;
    regional_submitted_at: string | null;
  }>(
    `select doc_no, branch, branch_note, branch_resolution, branch_new_ro, branch_submitted_by, branch_submitted_at,
            regional_note, regional_decision, regional_submitted_by, regional_submitted_at
     from cancellation_justifications where doc_no = any($1::text[])`,
    [docNos]
  );
  return new Map(rows.map((r) => [r.doc_no, mapRow(r)]));
}

/** The cancellation's real branch, straight from invoice_cancellations —
 * used to verify a regional admin's co-sign is actually within their own
 * region, rather than trusting whatever branch a form submits. */
export async function getCancellationBranch(docNo: string): Promise<string | null> {
  const { rows } = await pool.query<{ branch: string }>(`select branch from invoice_cancellations where doc_no = $1`, [docNo]);
  return rows[0]?.branch ?? null;
}

/** Upserts the branch's own reason — callable again to edit it, as long as
 * the regional manager hasn't approved yet (checked by the caller). Always
 * clears every regional_* field: a branch edit (including a resubmission
 * after a reject) must go back through regional review, never keep a stale
 * decision made against the previous note/RO. */
export async function submitBranchJustification(
  docNo: string,
  branch: string,
  username: string,
  note: string,
  resolution: BranchResolution,
  newRo: string | null
): Promise<void> {
  await pool.query(
    `insert into cancellation_justifications (doc_no, branch, branch_note, branch_resolution, branch_new_ro, branch_submitted_by, branch_submitted_at)
     values ($1, $2, $3, $4, $5, $6, now())
     on conflict (doc_no) do update set
       branch_note = excluded.branch_note,
       branch_resolution = excluded.branch_resolution,
       branch_new_ro = excluded.branch_new_ro,
       branch_submitted_by = excluded.branch_submitted_by,
       branch_submitted_at = excluded.branch_submitted_at,
       regional_note = null, regional_decision = null, regional_submitted_by = null, regional_submitted_at = null`,
    [docNo, branch, note, resolution, newRo, username]
  );
}

/** Regional approve/reject on top of the branch's own submission — the
 * caller must already have confirmed branch_submitted_at is set. Approving
 * an 'ro_cancelled' justification is what makes reconcile.ts and
 * cross-month-replacement.ts actually treat branch_new_ro as evidence of a
 * fix (see their effective-RO joins) — kept behind this sign-off on
 * purpose, so a branch can't unilaterally reclassify its own cancellation. */
export async function submitRegionalJustification(
  docNo: string,
  branch: string,
  username: string,
  note: string,
  decision: RegionalDecision
): Promise<void> {
  await pool.query(
    `update cancellation_justifications
     set regional_note = $3, regional_decision = $4, regional_submitted_by = $5, regional_submitted_at = now()
     where doc_no = $1 and branch = $2`,
    [docNo, branch, note, decision, username]
  );
}
