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
 *
 * THE RULE (2026-10-07, the VP's explicit correction, confirmed against two
 * worked examples): the amount excluded from the replacement's month is the
 * ORIGINAL (cancelled) invoice's own Part+Labour value — not the
 * replacement's, which is what this used to subtract. Worked examples:
 *   - Original ₹50k (Aug), replaced for ₹36k (Sep): subtract the whole
 *     ₹50k from Sep. Sep's raw SSRV089 data already naturally carries the
 *     new invoice's own +₹36k, so the net effect on Sep is 36-50 = -₹14k
 *     (today's behavior nets 0 — it only ever subtracted the ₹36k back out).
 *   - Original ₹50k (Aug), replaced for ₹60k (Sep): subtract the same
 *     ₹50k from Sep. Net effect: 60-50 = +₹10k added to Sep (today's
 *     behavior also nets 0 here).
 * One unified formula covers both: always subtract the ORIGINAL's value:
 * the direction (net gain or loss to the later month) falls out naturally
 * from whatever the replacement was actually worth.
 *
 * The original's own Part/Labour split comes from ITS OWN SSRV089/
 * SSRV089-BP row — branches never remove a dead row once it's been
 * uploaded, so the cancelled invoice's row is normally still sitting right
 * there under its own invoice number. Both GS and BP are scanned (BP's own
 * per-row data wasn't captured until 2026-10-07 — see ssrv089-bp/parse.ts).
 * When no original row can be found anywhere (pre-dates what's on file, or
 * a genuine gap) — original_part_sale/original_labour_sale come back null,
 * and loadCrossMonthReplacementAdjustmentForMonth falls back to the old
 * behavior (subtract the replacement's own value) for that one row, rather
 * than silently guessing. That fallback stays visible in the UI rather than
 * blending into a clean-looking total, same reasoning as a wrong RO match
 * staying visible instead of vanishing (see above).
 *
 * CUTOVER: cross_month_replacements is fully wiped and recomputed for a
 * branch on every one of its uploads, so a routine upload could otherwise
 * silently flip that branch's PAST adjustments onto the new formula too —
 * not what "forward only for now" means. NEW_RULE_CUTOVER_DATE fixes that:
 * a replacement is computed with the new rule only when its own row date is
 * on/after that date; anything earlier keeps using the replacement's own
 * value, exactly as it always has. Recompute stays safe to re-run at any
 * time. Backfilling history onto the new rule is a separate, later decision
 * once the user has checked the numbers — not done here.
 *
 * SKIP-ADJUSTMENT (2026-10-10): the "subtract from the replacement's month"
 * idea only makes sense because the ORIGINAL month's scom205 (Monthly KPI)
 * is assumed to still have the cancelled invoice's value frozen in it. That
 * assumption always holds when the cancellation happened in a LATER month
 * than the original invoice's own revenue month (that original month is
 * necessarily already closed and pulled by then). But when the cancellation
 * happened in the SAME month as the original invoice's own revenue (raised
 * and cancelled within one month, then rebilled later), it's not
 * guaranteed: if the cancellation came in BEFORE that month's own scom205
 * pull, the KPI already excluded it there and then — nothing is
 * double-counted, so subtracting the original's value from the
 * replacement's month would make the replacement's month WRONG (it never
 * had that value counted anywhere to begin with). `skipAdjustment` marks
 * exactly that case: still tracked/shown as "adjusted" (no justification
 * burden), but contributes $0 to loadCrossMonthReplacementAdjustmentForMonth
 * instead of the usual subtraction. Applies regardless of
 * NEW_RULE_CUTOVER_DATE — it's a different question (whether to subtract at
 * all) from which value to subtract.
 */

/** Replacements with a row date on/after this use the new (original-value)
 * rule; anything earlier keeps the old (replacement-value) rule — see the
 * CUTOVER section above. Update only if the user explicitly asks to move
 * the cutover; this is not a "ship date reference", it's the actual rule
 * boundary. */
export const NEW_RULE_CUTOVER_DATE = "2026-10-07";

export type CrossMonthReplacement = {
  branch: string;
  cancelledDocNo: string;
  refDocNo: string;
  /** The cancelled invoice's own revenue month (its issue date) — where its value is already counted. */
  cancelledMonth: string;
  replacementDocNo: string;
  /** YYYY-MM the replacement invoice actually landed in (its own SSRV089 row date's month) — where its value would otherwise be double-counted. */
  replacementMonth: string;
  /** The replacement's actual row date (not just month) — used only to decide which side of NEW_RULE_CUTOVER_DATE it falls on. */
  replacementDate: string;
  /** Part Sale + Oil Sale/Pnt Mat Sale combined, per the user's explicit call (2026-09-24) to treat Oil Sale as part of Parts for this purpose — the REPLACEMENT invoice's own value. Informational (shown in the UI); see originalPartSale for what's actually subtracted under the new rule. */
  partSale: number;
  labourSale: number;
  /** The ORIGINAL (cancelled) invoice's own Part/Labour value — what the new rule (on/after NEW_RULE_CUTOVER_DATE) actually subtracts from the replacement's month. Null when that original row can't be found anywhere on file — loadCrossMonthReplacementAdjustmentForMonth then falls back to partSale/labourSale instead. */
  originalPartSale: number | null;
  originalLabourSale: number | null;
  /** True when the cancellation happened in the same month as the original invoice's own revenue AND before that month's own KPI pull — scom205 already excluded it there, so no subtraction should be applied to the replacement's month either. See this file's SKIP-ADJUSTMENT doc comment. */
  skipAdjustment: boolean;
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
    replacement_date: string;
    part_sale: string;
    labour_sale: string;
    original_part_sale: string | null;
    original_labour_sale: string | null;
    skip_adjustment: boolean;
  }>(
    `select branch, cancelled_doc_no, ref_doc_no, cancelled_month, replacement_doc_no, replacement_month,
            replacement_date::text, part_sale, labour_sale, original_part_sale, original_labour_sale, skip_adjustment
     from cross_month_replacements`
  );

  return rows.map((r) => ({
    branch: r.branch,
    cancelledDocNo: r.cancelled_doc_no,
    refDocNo: r.ref_doc_no,
    cancelledMonth: r.cancelled_month,
    replacementDocNo: r.replacement_doc_no,
    replacementMonth: r.replacement_month,
    replacementDate: r.replacement_date,
    partSale: Number(r.part_sale),
    labourSale: Number(r.labour_sale),
    originalPartSale: r.original_part_sale === null ? null : Number(r.original_part_sale),
    originalLabourSale: r.original_labour_sale === null ? null : Number(r.original_labour_sale),
    skipAdjustment: r.skip_adjustment,
  }));
}

export type CrossMonthReplacementAdjustment = { partSale: number; labourSale: number };

/** Aggregated per branch for one `date`'s calendar month — dedupes by replacement invoice
 * across possibly-multiple cancelled docs on the same RO — for report.ts's GUS Parts/Labour
 * MTD formula. Excludes a replacement whose own month isn't `date`'s month: this only ever
 * reduces the month the replacement itself landed in, never any other month. Reads the
 * precomputed table (company-wide, but small — one row per cancelled/replacement pair), not raw_upload_rows.
 *
 * Picks which value to subtract per NEW_RULE_CUTOVER_DATE (see this file's
 * doc comment): the original's value on/after the cutover, the replacement's
 * own value before it — and also when the original's own row couldn't be
 * found at all (originalPartSale/originalLabourSale null), regardless of
 * cutover, since there's nothing else to subtract in that case. */
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
    if (r.skipAdjustment) continue; // already excluded from the original month's own KPI pull — nothing to subtract here
    const useOriginal = r.originalPartSale !== null && r.originalLabourSale !== null && r.replacementDate >= NEW_RULE_CUTOVER_DATE;
    const partSale = useOriginal ? r.originalPartSale! : r.partSale;
    const labourSale = useOriginal ? r.originalLabourSale! : r.labourSale;
    const existing = out.get(r.branch) ?? { partSale: 0, labourSale: 0 };
    out.set(r.branch, { partSale: existing.partSale + partSale, labourSale: existing.labourSale + labourSale });
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
    replacement_date: string;
    part_sale: string;
    labour_sale: string;
    original_part_sale: string | null;
    original_labour_sale: string | null;
    skip_adjustment: boolean;
  }>(
    `
    with canc as (
      select doc_no, branch, ref_doc_no, month as cancel_month,
             coalesce(cancel_at, cancel_date::timestamptz) as cancel_moment,
             coalesce(to_char(issue_date, 'YYYY-MM'), month) as revenue_month,
             replace(doc_no, '-', '') as doc_key
      from invoice_cancellations
      where ref_doc_no is not null and ref_doc_no <> '' and ($2::text[] is null or branch = any($2::text[]))
    ),
    -- The branch's freshest Monthly-KPI (scom205) read per month — same
    -- logic as reconcile.ts's own last_kpi CTE. Used only to decide
    -- skip_adjustment below: whether a same-month cancellation came in
    -- before or after that month's own KPI pull.
    last_kpi as (
      select distinct on (branch, to_char(date, 'YYYY-MM'))
             branch, to_char(date, 'YYYY-MM') as kmonth,
             date as last_date, uploaded_at as last_uploaded
      from scom205_snapshots
      where ($2::text[] is null or branch = any($2::text[]))
      order by branch, to_char(date, 'YYYY-MM'), date desc, uploaded_at desc
    ),
    -- GS (report_type 'ssrv089') and BP ('ssrv089_bp', added 2026-10-07 —
    -- see ssrv089-bp/parse.ts) scanned together: Oil Sale only exists on GS
    -- rows and Pnt Mat Sale only on BP rows, but both default to 0 via
    -- toNumericExpr when the column is absent, so summing all three is safe
    -- either way and needs no report_type branching.
    ssrv_dedup as (
      select branch, ro, inv, row_month,
             max(part_sale) as part_sale, max(oil_sale) as oil_sale, max(pnt_mat_sale) as pnt_mat_sale,
             max(labour_sale) as labour_sale, max(row_date) as row_date
      from (
        select r.branch,
               replace(r.row_data->>'JobOrder No', '-', '') as ro,
               replace(coalesce(r.row_data->>'Invoice Doc No.', ''), '-', '') as inv,
               to_char(r.date, 'YYYY-MM') as row_month,
               r.date as row_date,
               ${toNumericExpr("Part Sale")} as part_sale,
               ${toNumericExpr("Oil Sale")} as oil_sale,
               ${toNumericExpr("Pnt Mat Sale")} as pnt_mat_sale,
               ${toNumericExpr("Labour Sale")} as labour_sale
        from raw_upload_rows r
        where r.report_type in ('ssrv089', 'ssrv089_bp') and r.date >= $1::date and ($2::text[] is null or r.branch = any($2::text[]))
      ) x
      group by branch, ro, inv, row_month
    )
    select c.branch, c.doc_no as cancelled_doc, c.ref_doc_no, c.revenue_month as cancelled_month,
           s.inv as replacement_doc, s.row_month as replacement_month, s.row_date::text as replacement_date,
           s.part_sale + s.oil_sale + s.pnt_mat_sale as part_sale, s.labour_sale,
           orig.part_sale as original_part_sale, orig.labour_sale as original_labour_sale,
           -- See this file's SKIP-ADJUSTMENT doc comment: only relevant when
           -- the cancellation landed in the SAME month as the original
           -- invoice's own revenue (c.cancel_month = c.revenue_month) — a
           -- cancellation in a later month is always safely "after that
           -- month's cutoff" since the month is already closed by then.
           (c.cancel_month = c.revenue_month and lk.branch is not null
              and c.cancel_moment <= greatest(lk.last_uploaded, lk.last_date::timestamptz)) as skip_adjustment
    from canc c
    join ssrv_dedup s on s.branch = c.branch and s.ro = c.ref_doc_no and s.inv <> c.doc_key and s.inv <> ''
    -- The cancelled invoice's own row, wherever it is — normally still
    -- sitting under its own invoice number since branches never remove a
    -- dead row (see this file's doc comment). earliest asc picks the oldest
    -- match deterministically in the unexpected case of more than one.
    left join lateral (
      select o.part_sale + o.oil_sale + o.pnt_mat_sale as part_sale, o.labour_sale
      from ssrv_dedup o
      where o.branch = c.branch and o.ro = c.ref_doc_no and o.inv = c.doc_key
      order by o.row_month asc
      limit 1
    ) orig on true
    left join last_kpi lk on lk.branch = c.branch and lk.kmonth = c.revenue_month
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
    replacementDate: r.replacement_date,
    partSale: Number(r.part_sale),
    labourSale: Number(r.labour_sale),
    originalPartSale: r.original_part_sale === null ? null : Number(r.original_part_sale),
    originalLabourSale: r.original_labour_sale === null ? null : Number(r.original_labour_sale),
    skipAdjustment: r.skip_adjustment,
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
           (branch, cancelled_doc_no, ref_doc_no, cancelled_month, replacement_doc_no, replacement_month, replacement_date, part_sale, labour_sale, original_part_sale, original_labour_sale, skip_adjustment)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          r.branch,
          r.cancelledDocNo,
          r.refDocNo,
          r.cancelledMonth,
          r.replacementDocNo,
          r.replacementMonth,
          r.replacementDate,
          r.partSale,
          r.labourSale,
          r.originalPartSale,
          r.originalLabourSale,
          r.skipAdjustment,
        ]
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
