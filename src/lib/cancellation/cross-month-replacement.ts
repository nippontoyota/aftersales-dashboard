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
 * the user's explicit request.
 *
 * Company-wide as of 2026-10-06 (user's explicit call): earlier this only
 * ran for branches individually vetted for implausible RO-match gaps (a tell
 * for a reused Job Order number rather than real re-invoicing — the issue
 * that excluded IR01A, and that held TR01A back pending its own look). The
 * user decided a questionable match isn't a real risk here, because it never
 * disappears silently — every match, including a wrong one, sits permanently
 * in the "Cross-month replacements — adjusted" section of /cancellations
 * (docNo, RO, replacement doc, amounts all shown), so a bad match stays
 * visible to catch and fix rather than vanishing into a correct-looking
 * total. No branch allowlist needed any more; this runs for every branch.
 *
 * As of 2026-10-01 the result is precomputed into cross_month_replacements
 * at upload time (see adjustment-recompute.ts and its callers) instead of
 * being recomputed from raw_upload_rows on every page load — this query used
 * to run on every /dashboard, /ceo and /queries render, which stopped being
 * viable once raw_upload_rows passed 3.7M rows. computeCrossMonthReplacementsFresh
 * below is now only ever called by the recompute path.
 */

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
 * precomputed table (company-wide, but small — one row per cancelled/replacement pair), not raw_upload_rows. */
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
 * slower every single day).
 *
 * `branches` scopes both sides of the match to just those branches — pass it
 * from the per-upload recompute path so one branch's upload only ever costs
 * a scan of that branch's own rows (full company-wide run, ~47s as of
 * 2026-10-06 with 3.7M+ raw_upload_rows, is far too slow to run inside the
 * blocking upload request every branch triggers). Omit it only for an
 * explicit full recompute (e.g. a one-off backfill script). */
export async function computeCrossMonthReplacementsFresh(branches?: string[]): Promise<CrossMonthReplacement[]> {
  if (branches && branches.length === 0) return [];

  const { rows: boundRows } = await pool.query<{ earliest: string | null }>(
    `select min(coalesce(issue_date, (month || '-01')::date))::text as earliest
     from invoice_cancellations
     where ref_doc_no is not null and ref_doc_no <> '' and ($1::text[] is null or branch = any($1::text[]))`,
    [branches ?? null]
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
      where ref_doc_no is not null and ref_doc_no <> '' and ($2::text[] is null or branch = any($2::text[]))
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
        where r.report_type = 'ssrv089' and r.date >= $1::date and ($2::text[] is null or r.branch = any($2::text[]))
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
    [earliest, branches ?? null]
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

/** Recomputes cross_month_replacements and replaces every row — scoped to
 * `branches` when given (the normal per-upload path, cheap), or every
 * branch in the table when omitted (an explicit full recompute only; see
 * computeCrossMonthReplacementsFresh's doc comment on why that's slow). */
export async function recomputeCrossMonthReplacements(branches?: string[]): Promise<void> {
  const fresh = await computeCrossMonthReplacementsFresh(branches);

  const client = await pool.connect();
  try {
    await client.query("begin");
    if (branches) {
      await client.query(`delete from cross_month_replacements where branch = any($1::text[])`, [branches]);
    } else {
      await client.query(`delete from cross_month_replacements`);
    }
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
