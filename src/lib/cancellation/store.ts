import { pool } from "../db";
import type { CancellationRow } from "./parse-tables";

/**
 * invoice_cancellations + invoice_cancellation_files (see db/schema.sql).
 * A monthly per-branch feed; a re-upload for a `(branch, month)` atomically
 * replaces every row for that pair. Control/audit only — nothing here feeds
 * a revenue figure.
 */

export type CancellationRecord = CancellationRow & {
  branch: string;
  month: string;
  sourceFileName: string;
  uploadedAt: string;
};

export type CancellationMonthSummary = {
  branch: string;
  month: string;
  count: number;
  beforeTaxTotal: number;
  afterTaxTotal: number;
  uploadedAt: string;
  sourceFileName: string;
};

export type CancellationKpi = {
  branch: string;
  month: string;
  count: number;
  beforeTaxTotal: number;
  afterTaxTotal: number;
  /** reason label -> count */
  byReason: Record<string, number>;
  dataEntryMistakes: number;
  cancelledForWarranty: number;
};

/**
 * Merges one branch-month's cancellations by DocNo and keeps its latest
 * source file. The report can be uploaded any time a cancellation comes in
 * — a single day, a range, or a whole month — so each upload UPSERTs the
 * rows it carries and removes nothing (a cancellation is terminal; it never
 * un-cancels). A re-upload of the same DocNo refreshes its values.
 */
export async function saveCancellationReport(params: {
  branch: string;
  month: string;
  rows: CancellationRow[];
  fileData: Buffer;
  sourceFileName: string;
  uploadedAt: string;
  uploadedBy: string;
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");

    for (const r of params.rows) {
      await client.query(
        `insert into invoice_cancellations
           (doc_no, branch, month, cancel_date, cancel_at, cancel_reason, ref_doc_no, reg_no,
            owner_code, owner_name, doc_customer, issue_date, before_tax, tax, after_tax,
            cancelled_by, source_file_name, uploaded_at, uploaded_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         on conflict (doc_no) do update set
           branch = excluded.branch, month = excluded.month,
           cancel_date = excluded.cancel_date, cancel_at = excluded.cancel_at,
           cancel_reason = excluded.cancel_reason, ref_doc_no = excluded.ref_doc_no,
           reg_no = excluded.reg_no, owner_code = excluded.owner_code,
           owner_name = excluded.owner_name, doc_customer = excluded.doc_customer,
           issue_date = excluded.issue_date, before_tax = excluded.before_tax,
           tax = excluded.tax, after_tax = excluded.after_tax,
           cancelled_by = excluded.cancelled_by, source_file_name = excluded.source_file_name,
           uploaded_at = excluded.uploaded_at, uploaded_by = excluded.uploaded_by`,
        [
          r.docNo, params.branch, params.month, r.cancelDate, r.cancelAt, r.cancelReason, r.refDocNo, r.regNo,
          r.ownerCode, r.ownerName, r.docCustomer, r.issueDate, r.beforeTax, r.tax, r.afterTax,
          r.cancelledBy, params.sourceFileName, params.uploadedAt, params.uploadedBy,
        ],
      );
    }

    // A plain insert, never an upsert — one row per upload (see schema.sql's
    // 2026-09-23 migration), not one per (branch, month). The old
    // on-conflict-overwrite silently discarded every earlier upload's PDF
    // the moment a branch uploaded a second, incremental round that month.
    await client.query(
      `insert into invoice_cancellation_files (branch, month, uploaded_at, uploaded_by, source_file_name, file_data)
       values ($1,$2,$3,$4,$5,$6)`,
      [params.branch, params.month, params.uploadedAt, params.uploadedBy, params.sourceFileName, params.fileData],
    );

    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

/** One row per uploaded branch-month — for the page's month + branch pickers.
 * `uploaded_at`/`source_file_name` describe the MOST RECENT of possibly
 * several uploads that branch-month has (see invoice_cancellation_files) —
 * a `distinct on` per (branch, month) rather than two independent `max()`s,
 * so they always describe the same upload rather than mixing the latest
 * timestamp with an unrelated (alphabetically-last) filename. */
export async function loadCancellationMonthSummaries(branch?: string): Promise<CancellationMonthSummary[]> {
  const { rows } = await pool.query<{
    branch: string; month: string; count: string;
    before_tax_total: string; after_tax_total: string;
    uploaded_at: string | null; source_file_name: string | null;
  }>(
    `select c.branch, c.month, count(*)::int as count,
            coalesce(sum(c.before_tax), 0) as before_tax_total,
            coalesce(sum(c.after_tax), 0)  as after_tax_total,
            latest.uploaded_at, latest.source_file_name
     from invoice_cancellations c
     left join lateral (
       select uploaded_at, source_file_name from invoice_cancellation_files f
       where f.branch = c.branch and f.month = c.month
       order by f.uploaded_at desc limit 1
     ) latest on true
     ${branch ? "where c.branch = $1" : ""}
     group by c.branch, c.month, latest.uploaded_at, latest.source_file_name
     order by c.month desc, c.branch`,
    branch ? [branch] : [],
  );
  return rows.map((r) => ({
    branch: r.branch,
    month: r.month,
    count: Number(r.count),
    beforeTaxTotal: Number(r.before_tax_total),
    afterTaxTotal: Number(r.after_tax_total),
    uploadedAt: r.uploaded_at ?? "",
    sourceFileName: r.source_file_name ?? "",
  }));
}

/** Every available month (newest first), across all branches — the month picker. */
export async function loadCancellationMonths(branch?: string): Promise<string[]> {
  const { rows } = await pool.query<{ month: string }>(
    `select distinct month from invoice_cancellations ${branch ? "where branch = $1" : ""} order by month desc`,
    branch ? [branch] : [],
  );
  return rows.map((r) => r.month);
}

export async function loadCancellationsForMonth(month: string, branch?: string): Promise<CancellationRecord[]> {
  const { rows } = await pool.query(
    `select doc_no, branch, month, cancel_date::text as cancel_date, cancel_at, cancel_reason, ref_doc_no, reg_no,
            owner_code, owner_name, doc_customer, issue_date::text as issue_date,
            before_tax, tax, after_tax, cancelled_by, source_file_name, uploaded_at
     from invoice_cancellations
     where month = $1 ${branch ? "and branch = $2" : ""}
     order by branch, cancel_date, doc_no`,
    branch ? [month, branch] : [month],
  );
  return rows.map((r) => ({
    docNo: r.doc_no,
    branch: r.branch,
    month: r.month,
    cancelDate: r.cancel_date,
    cancelAt: r.cancel_at ? new Date(r.cancel_at).toISOString() : null,
    cancelReason: r.cancel_reason,
    refDocNo: r.ref_doc_no,
    regNo: r.reg_no,
    ownerCode: r.owner_code,
    ownerName: r.owner_name,
    docCustomer: r.doc_customer,
    issueDate: r.issue_date,
    beforeTax: Number(r.before_tax),
    tax: Number(r.tax),
    afterTax: Number(r.after_tax),
    cancelledBy: r.cancelled_by,
    sourceFileName: r.source_file_name,
    uploadedAt: r.uploaded_at,
  }));
}

export async function loadCancellationKpis(month: string, branches?: string[]): Promise<CancellationKpi[]> {
  const { rows } = await pool.query<{
    branch: string; cancel_reason: string; n: string; before_tax: string; after_tax: string;
  }>(
    `select branch, cancel_reason, count(*)::int as n,
            coalesce(sum(before_tax), 0) as before_tax,
            coalesce(sum(after_tax), 0)  as after_tax
     from invoice_cancellations
     where month = $1 ${branches && branches.length ? "and branch = any($2::text[])" : ""}
     group by branch, cancel_reason`,
    branches && branches.length ? [month, branches] : [month],
  );

  const byBranch = new Map<string, CancellationKpi>();
  for (const r of rows) {
    let k = byBranch.get(r.branch);
    if (!k) {
      k = { branch: r.branch, month, count: 0, beforeTaxTotal: 0, afterTaxTotal: 0, byReason: {}, dataEntryMistakes: 0, cancelledForWarranty: 0 };
      byBranch.set(r.branch, k);
    }
    const n = Number(r.n);
    k.count += n;
    k.beforeTaxTotal += Number(r.before_tax);
    k.afterTaxTotal += Number(r.after_tax);
    k.byReason[r.cancel_reason] = (k.byReason[r.cancel_reason] ?? 0) + n;
    if (r.cancel_reason === "Data Entry Mistake") k.dataEntryMistakes += n;
    if (r.cancel_reason === "Cancelled for Warranty") k.cancelledForWarranty += n;
  }
  return [...byBranch.values()].sort((a, b) => b.count - a.count);
}

export type CancellationFileInfo = { id: number; branch: string; month: string; uploadedAt: string; sourceFileName: string };

/** Every uploaded file for a set of branch-months, oldest first within each —
 * a branch that uploads incrementally through the month gets one entry per
 * round, not just the latest (see schema.sql's 2026-09-23 migration). One
 * query for however many branches the caller needs, not one per branch. */
export async function listCancellationFiles(month: string, branches?: string[]): Promise<CancellationFileInfo[]> {
  const { rows } = await pool.query<{ id: string; branch: string; month: string; uploaded_at: string; source_file_name: string }>(
    `select id, branch, month, uploaded_at, source_file_name from invoice_cancellation_files
     where month = $1 ${branches && branches.length ? "and branch = any($2::text[])" : ""}
     order by branch, uploaded_at`,
    branches && branches.length ? [month, branches] : [month],
  );
  return rows.map((r) => ({ id: Number(r.id), branch: r.branch, month: r.month, uploadedAt: r.uploaded_at, sourceFileName: r.source_file_name }));
}

/** One specific upload's PDF bytes, scoped to the branch/month it claims to
 * belong to (defense in depth alongside the API route's own access check —
 * a caller can't fetch another branch's file just by guessing an id). */
export async function getCancellationFileById(id: number, branch: string, month: string): Promise<{ fileName: string; data: Buffer } | null> {
  const { rows } = await pool.query<{ source_file_name: string; file_data: Buffer }>(
    `select source_file_name, file_data from invoice_cancellation_files where id = $1 and branch = $2 and month = $3`,
    [id, branch, month],
  );
  return rows[0] ? { fileName: rows[0].source_file_name, data: rows[0].file_data } : null;
}

/** The most recently uploaded file for a branch-month — used by the
 * legacy/bookmarked PDF route so an old link still resolves to something
 * sensible instead of erroring. */
export async function getLatestCancellationFile(branch: string, month: string): Promise<{ fileName: string; data: Buffer } | null> {
  const { rows } = await pool.query<{ source_file_name: string; file_data: Buffer }>(
    `select source_file_name, file_data from invoice_cancellation_files
     where branch = $1 and month = $2 order by uploaded_at desc limit 1`,
    [branch, month],
  );
  return rows[0] ? { fileName: rows[0].source_file_name, data: rows[0].file_data } : null;
}
