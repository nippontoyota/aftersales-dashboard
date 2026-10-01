import { pool } from "../db";

/**
 * A cancelled invoice's job (RO) sometimes gets re-invoiced under a new
 * invoice number in a LATER calendar month than the cancelled invoice's own
 * revenue month (2026-09-24, KT01A: two August invoices on job GSJ2611587
 * were cancelled + replaced by one September invoice, TXC26-08862). That
 * August revenue is already frozen in scom205's cumulative MTD figure for
 * August (scom205 is only net of cancellations as of its own pull time —
 * see cancellation-adjustment.ts's doc comment), so if the September
 * replacement's value is also counted in September, the same job's revenue
 * is effectively double-counted across two months. This excludes the
 * replacement's value from the month it actually landed in.
 *
 * Matching is by RO (Job Order No) alone, no amount-closeness check — at
 * the user's explicit request. Scoped to CROSS_MONTH_REPLACEMENT_BRANCHES
 * only, not company-wide yet (see that constant's own comment).
 *
 * As of 2026-10-01 the result is precomputed into cross_month_replacements
 * at upload time (see adjustment-recompute.ts and its callers) instead of
 * being recomputed from raw_upload_rows on every page load — this query used
 * to run on every /dashboard, /ceo and /queries render, which stopped being
 * viable once raw_upload_rows passed 3.7M rows. computeCrossMonthReplacementsFresh
 * below is now only ever called by the recompute path.
 */

/** Branches this adjustment applies to. IR01A was checked the same way as
 * KT01A (2026-09-24) and excluded: its cancellation data has an unrelated
 * data-integrity issue (a corrupted cancellation-report file record for
 * September — byte-identical to June's file), and several of its RO matches
 * span implausible gaps (up to 5 months, one RO matching 3 different
 * cancelled invoices) that look like reused Job Order numbers rather than
 * real re-invoicing. Widen this list only after a branch's own cancellation
 * data has been checked the same way, not by default. */
export const CROSS_MONTH_REPLACEMENT_BRANCHES = new Set(["KT01A"]);

export type CrossMonthReplacement = {
  branch: string;
  cancelledDocNo: string;
  refDocNo: string;
  /** The cancelled invoice's own revenue month (its issue date) — where its value is already counted. */
  cancelledMonth: string;
  replacementDocNo: string;
  /** YYYY-MM the replacement invoice actually landed in (its own SSRV089 row date's month) — where its value would otherwise be double-counted. */
  replacementMonth: string;
  /** Part Sale + Oil Sale combined, per the user's explicit call (2026-09-24) to treat Oil Sale as part of Parts for this purpose. */
  partSale: number;
  labourSale: number;
};

function toNumericExpr(column: string): string {
  return `coalesce(nullif(regexp_replace(coalesce(r.row_data->>'${column}', ''), '[^0-9.\\-]', '', 'g'), '')::numeric, 0)`;
}

/** Fast path — reads the precomputed table, no raw_upload_rows involved.
 * Used by reconcile.ts for the per-cancelled-doc reconciliation view. */
export async function loadCrossMonthReplacements(): Promise<CrossMonthReplacement[]> {
  const { rows } = await pool.query<{
    branch: string;
    cancelled_doc_no: string;
    ref_doc_no: string;
    cancelled_month: string;
    replacement_doc_no: string;
    replacement_month: string;
    part_sale: string;
    labour_sale: string;
  }>(`select branch, cancelled_doc_no, ref_doc_no, cancelled_month, replacement_doc_no, replacement_month, part_sale, labour_sale from cross_month_replacements`);

  return rows.map((r) => ({
    branch: r.branch,
    cancelledDocNo: r.cancelled_doc_no,
    refDocNo: r.ref_doc_no,
    cancelledMonth: r.cancelled_month,
    replacementDocNo: r.replacement_doc_no,
    replacementMonth: r.replacement_month,
    partSale: Number(r.part_sale),
    labourSale: Number(r.labour_sale),
  }));
}

export type CrossMonthReplacementAdjustment = { partSale: number; labourSale: number };

/** Aggregated per branch for one `date`'s calendar month — dedupes by replacement invoice
 * across possibly-multiple cancelled docs on the same RO — for report.ts's GUS Parts/Labour
 * MTD formula. Excludes a replacement whose own month isn't `date`'s month: this only ever
 * reduces the month the replacement itself landed in, never any other month. Reads the
 * precomputed table (tiny — bounded by CROSS_MONTH_REPLACEMENT_BRANCHES), not raw_upload_rows. */
export async function loadCrossMonthReplacementAdjustmentForMonth(date: string): Promise<Map<string, CrossMonthReplacementAdjustment>> {
  const month = date.slice(0, 7);
  const all = await loadCrossMonthReplacements();
  const seenReplacement = new Set<string>(); // `${branch}|${replacementDocNo}` — a replacement matched by several cancelled docs is only subtracted once
  const out = new Map<string, CrossMonthReplacementAdjustment>();
  for (const r of all) {
    if (r.replacementMonth !== month) continue;
    const replacementKey = `${r.branch}|${r.replacementDocNo}`;
    if (seenReplacement.has(replacementKey)) continue;
    seenReplacement.add(replacementKey);
    const existing = out.get(r.branch) ?? { partSale: 0, labourSale: 0 };
    out.set(r.branch, { partSale: existing.partSale + r.partSale, labourSale: existing.labourSale + r.labourSale });
  }
  return out;
}

/** The original live computation — only ever called by the recompute path
 * (adjustment-recompute.ts), never from a page read. Bounded to
 * raw_upload_rows dated on/after the earliest revenue month any qualifying
 * cancellation could need a replacement for, since a replacement can only
 * ever land in a month AFTER its cancellation's revenue month (enforced
 * below by `s.row_month > c.revenue_month`) — rows before that can never
 * match, so there's no reason to keep scanning further back as history
 * grows (2026-10-01; this query previously had no date bound at all and got
 * slower every single day). */
export async function computeCrossMonthReplacementsFresh(): Promise<CrossMonthReplacement[]> {
  if (CROSS_MONTH_REPLACEMENT_BRANCHES.size === 0) return [];
  const branches = [...CROSS_MONTH_REPLACEMENT_BRANCHES];

  const { rows: boundRows } = await pool.query<{ earliest: string | null }>(
    `select min(coalesce(issue_date, (month || '-01')::date))::text as earliest
     from invoice_cancellations
     where branch = any($1::text[]) and ref_doc_no is not null and ref_doc_no <> ''`,
    [branches]
  );
  const earliest = boundRows[0]?.earliest;
  if (!earliest) return []; // nothing to match against — skip the raw_upload_rows scan entirely

  const { rows } = await pool.query<{
    branch: string;
    cancelled_doc: string;
    ref_doc_no: string;
    cancelled_month: string;
    replacement_doc: string;
    replacement_month: string;
    part_sale: string;
    labour_sale: string;
  }>(
    `
    with canc as (
      select doc_no, branch, ref_doc_no,
             coalesce(to_char(issue_date, 'YYYY-MM'), month) as revenue_month,
             replace(doc_no, '-', '') as doc_key
      from invoice_cancellations
      where branch = any($1::text[]) and ref_doc_no is not null and ref_doc_no <> ''
    ),
    ssrv_dedup as (
      select branch, ro, inv, row_month,
             max(part_sale) as part_sale, max(oil_sale) as oil_sale, max(labour_sale) as labour_sale
      from (
        select r.branch,
               replace(r.row_data->>'JobOrder No', '-', '') as ro,
               replace(coalesce(r.row_data->>'Invoice Doc No.', ''), '-', '') as inv,
               to_char(r.date, 'YYYY-MM') as row_month,
               ${toNumericExpr("Part Sale")} as part_sale,
               ${toNumericExpr("Oil Sale")} as oil_sale,
               ${toNumericExpr("Labour Sale")} as labour_sale
        from raw_upload_rows r
        where r.report_type = 'ssrv089' and r.branch = any($1::text[]) and r.date >= $2::date
      ) x
      group by branch, ro, inv, row_month
    )
    select c.branch, c.doc_no as cancelled_doc, c.ref_doc_no, c.revenue_month as cancelled_month,
           s.inv as replacement_doc, s.row_month as replacement_month,
           s.part_sale + s.oil_sale as part_sale, s.labour_sale
    from canc c
    join ssrv_dedup s on s.branch = c.branch and s.ro = c.ref_doc_no and s.inv <> c.doc_key and s.inv <> ''
    where s.row_month > c.revenue_month
    order by c.branch, c.revenue_month, c.doc_no
    `,
    [branches, earliest]
  );

  return rows.map((r) => ({
    branch: r.branch,
    cancelledDocNo: r.cancelled_doc,
    refDocNo: r.ref_doc_no,
    cancelledMonth: r.cancelled_month,
    replacementDocNo: r.replacement_doc,
    replacementMonth: r.replacement_month,
    partSale: Number(r.part_sale),
    labourSale: Number(r.labour_sale),
  }));
}

/** Recomputes cross_month_replacements from scratch and replaces every row
 * scoped to CROSS_MONTH_REPLACEMENT_BRANCHES (the only branches this table
 * ever holds data for) in one transaction. */
export async function recomputeCrossMonthReplacements(): Promise<void> {
  const fresh = await computeCrossMonthReplacementsFresh();
  const branches = [...CROSS_MONTH_REPLACEMENT_BRANCHES];

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`delete from cross_month_replacements where branch = any($1::text[])`, [branches]);
    for (const r of fresh) {
      await client.query(
        `insert into cross_month_replacements
           (branch, cancelled_doc_no, ref_doc_no, cancelled_month, replacement_doc_no, replacement_month, part_sale, labour_sale)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [r.branch, r.cancelledDocNo, r.refDocNo, r.cancelledMonth, r.replacementDocNo, r.replacementMonth, r.partSale, r.labourSale]
      );
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
