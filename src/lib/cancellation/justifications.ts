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
export type CancellationJustification = {
  docNo: string;
  branch: string;
  branchNote: string | null;
  branchSubmittedBy: string | null;
  branchSubmittedAt: string | null;
  regionalNote: string | null;
  regionalSubmittedBy: string | null;
  regionalSubmittedAt: string | null;
};

export type JustificationStatus = "none" | "branch_submitted" | "resolved";

export function justificationStatus(j: CancellationJustification | undefined): JustificationStatus {
  if (!j || !j.branchSubmittedAt) return "none";
  if (!j.regionalSubmittedAt) return "branch_submitted";
  return "resolved";
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
  branch_submitted_by: string | null;
  branch_submitted_at: string | null;
  regional_note: string | null;
  regional_submitted_by: string | null;
  regional_submitted_at: string | null;
}): CancellationJustification {
  return {
    docNo: r.doc_no,
    branch: r.branch,
    branchNote: r.branch_note,
    branchSubmittedBy: r.branch_submitted_by,
    branchSubmittedAt: r.branch_submitted_at,
    regionalNote: r.regional_note,
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
    branch_submitted_by: string | null;
    branch_submitted_at: string | null;
    regional_note: string | null;
    regional_submitted_by: string | null;
    regional_submitted_at: string | null;
  }>(
    `select doc_no, branch, branch_note, branch_submitted_by, branch_submitted_at,
            regional_note, regional_submitted_by, regional_submitted_at
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

/** Upserts the branch's own note — callable again to edit it, as long as
 * the regional manager hasn't co-signed yet (checked by the caller). */
export async function submitBranchJustification(docNo: string, branch: string, username: string, note: string): Promise<void> {
  await pool.query(
    `insert into cancellation_justifications (doc_no, branch, branch_note, branch_submitted_by, branch_submitted_at)
     values ($1, $2, $3, $4, now())
     on conflict (doc_no) do update set branch_note = excluded.branch_note, branch_submitted_by = excluded.branch_submitted_by, branch_submitted_at = excluded.branch_submitted_at`,
    [docNo, branch, note, username]
  );
}

/** Regional co-sign — the caller must already have confirmed branch_submitted_at is set. */
export async function submitRegionalJustification(docNo: string, branch: string, username: string, note: string): Promise<void> {
  await pool.query(
    `update cancellation_justifications
     set regional_note = $3, regional_submitted_by = $4, regional_submitted_at = now()
     where doc_no = $1 and branch = $2`,
    [docNo, branch, note, username]
  );
}
