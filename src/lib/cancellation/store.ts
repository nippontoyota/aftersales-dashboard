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

/** Atomically replace one branch-month's rows and file. */
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

    // A cancelled DocNo is globally unique but the primary key is doc_no, so
    // clear this branch-month's existing rows before re-inserting. Also clear
    // any row that would collide on doc_no from a different (branch, month) —
    // shouldn't happen, but a re-upload must not fail on a stray duplicate.
    await client.query("delete from invoice_cancellations where branch = $1 and month = $2", [params.branch, params.month]);
    if (params.rows.length > 0) {
      await client.query("delete from invoice_cancellations where doc_no = any($1::text[])", [params.rows.map((r) => r.docNo)]);
    }

    for (const r of params.rows) {
      await client.query(
        `insert into invoice_cancellations
           (doc_no, branch, month, cancel_date, cancel_reason, ref_doc_no, reg_no,
            owner_code, owner_name, doc_customer, issue_date, before_tax, tax, after_tax,
            cancelled_by, source_file_name, uploaded_at, uploaded_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          r.docNo, params.branch, params.month, r.cancelDate, r.cancelReason, r.refDocNo, r.regNo,
          r.ownerCode, r.ownerName, r.docCustomer, r.issueDate, r.beforeTax, r.tax, r.afterTax,
          r.cancelledBy, params.sourceFileName, params.uploadedAt, params.uploadedBy,
        ],
      );
    }

    await client.query(
      `insert into invoice_cancellation_files (branch, month, uploaded_at, uploaded_by, source_file_name, file_data)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (branch, month) do update set
         uploaded_at = excluded.uploaded_at,
         uploaded_by = excluded.uploaded_by,
         source_file_name = excluded.source_file_name,
         file_data = excluded.file_data`,
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

/** One row per uploaded branch-month — for the page's month + branch pickers. */
export async function loadCancellationMonthSummaries(branch?: string): Promise<CancellationMonthSummary[]> {
  const { rows } = await pool.query<{
    branch: string; month: string; count: string;
    before_tax_total: string; after_tax_total: string;
    uploaded_at: string; source_file_name: string;
  }>(
    `select c.branch, c.month, count(*)::int as count,
            coalesce(sum(c.before_tax), 0) as before_tax_total,
            coalesce(sum(c.after_tax), 0)  as after_tax_total,
            max(f.uploaded_at) as uploaded_at,
            max(f.source_file_name) as source_file_name
     from invoice_cancellations c
     left join invoice_cancellation_files f on f.branch = c.branch and f.month = c.month
     ${branch ? "where c.branch = $1" : ""}
     group by c.branch, c.month
     order by c.month desc, c.branch`,
    branch ? [branch] : [],
  );
  return rows.map((r) => ({
    branch: r.branch,
    month: r.month,
    count: Number(r.count),
    beforeTaxTotal: Number(r.before_tax_total),
    afterTaxTotal: Number(r.after_tax_total),
    uploadedAt: r.uploaded_at,
    sourceFileName: r.source_file_name,
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
    `select doc_no, branch, month, cancel_date::text as cancel_date, cancel_reason, ref_doc_no, reg_no,
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

export async function getCancellationFile(branch: string, month: string): Promise<{ fileName: string; data: Buffer } | null> {
  const { rows } = await pool.query<{ source_file_name: string; file_data: Buffer }>(
    `select source_file_name, file_data from invoice_cancellation_files where branch = $1 and month = $2`,
    [branch, month],
  );
  return rows[0] ? { fileName: rows[0].source_file_name, data: rows[0].file_data } : null;
}
