import { pool } from "../db";

/**
 * Fix for the TR01C ₹10,190 shortfall (2026-09-19): GUS Parts/Labour MTD is
 * scom205's cumulative total minus the branch's Accessories Part/Labour Sale
 * (summed straight off SSRV089-General rows closed by Accessories staff —
 * see ssrv089/parse.ts). scom205 is already net of cancellations as of the
 * DMS's own pull time, but that Accessories subtraction is computed purely
 * from SSRV089 rows and has never checked invoice_cancellations — so a
 * cancelled invoice closed by an Accessories-staff SA keeps getting
 * subtracted forever (or until the branch re-uploads a corrected SSRV089
 * that drops the row), silently deflating Total Revenue by that invoice's
 * value on top of the DMS's own correct netting.
 *
 * This computes the correction: for every SSRV089-General row this month
 * whose Invoice Doc No. matches a cancelled invoice for that branch (any
 * cancel record, matched on the invoice's own revenue month) and whose
 * Close SA Name is Accessories staff, sum its Part Sale / Labour Sale so
 * report.ts can add it back onto the Accessories deduction.
 *
 * As of 2026-10-01 this is precomputed at upload time into
 * cancelled_accessories_adjustments (see adjustment-recompute.ts and its
 * callers) rather than run live against raw_upload_rows on every page
 * load — that table has grown past the point where this join is cheap
 * enough to repeat on every /dashboard, /ceo and /queries render. The live
 * query below (computeCancelledAccessoriesAdjustmentForBranchMonth) is now
 * only ever invoked by the recompute path, scoped to one branch+month at a
 * time so each run stays cheap regardless of raw_upload_rows' total size.
 */
export type CancelledAccessoriesAdjustment = {
  partSale: number;
  labourSale: number;
};

function toNumericExpr(column: string): string {
  return `coalesce(nullif(regexp_replace(coalesce(r.row_data->>'${column}', ''), '[^0-9.\\-]', '', 'g'), '')::numeric, 0)`;
}

/** Fast path for report.ts — a flat keyed lookup against the precomputed
 * table, independent of raw_upload_rows' size. */
export async function loadCancelledAccessoriesAdjustmentForMonth(
  date: string
): Promise<Map<string, CancelledAccessoriesAdjustment>> {
  const month = date.slice(0, 7);
  const { rows } = await pool.query<{ branch: string; part_sale: string; labour_sale: string }>(
    `select branch, part_sale, labour_sale from cancelled_accessories_adjustments where revenue_month = $1`,
    [month]
  );
  return new Map(rows.map((r) => [r.branch, { partSale: Number(r.part_sale), labourSale: Number(r.labour_sale) }]));
}

/** The original live computation, scoped to one branch + month so a
 * per-upload recompute stays cheap no matter how big raw_upload_rows gets —
 * only ever called by adjustment-recompute.ts, never from a page read. */
async function computeCancelledAccessoriesAdjustmentForBranchMonth(
  branch: string,
  month: string
): Promise<CancelledAccessoriesAdjustment | null> {
  const { rows } = await pool.query<{ part_sale: string; labour_sale: string }>(
    `
    with canc as (
      select branch, replace(doc_no, '-', '') as doc_key,
             coalesce(to_char(issue_date, 'YYYY-MM'), month) as revenue_month
      from invoice_cancellations
      where branch = $2
    ),
    ssrv as (
      select r.branch,
             replace(coalesce(r.row_data->>'Invoice Doc No.', ''), '-', '') as inv,
             trim(coalesce(r.row_data->>'Close SA Name', '')) as close_sa_name,
             ${toNumericExpr("Part Sale")} as part_sale,
             ${toNumericExpr("Labour Sale")} as labour_sale
      from raw_upload_rows r
      -- date range + branch, both covered by raw_upload_rows_lookup_idx
      -- (report_type, date, branch) — see the identical note this query
      -- used to carry before being scoped to one branch+month at upload
      -- time (2026-10-01, see this file's top comment).
      where r.report_type = 'ssrv089'
        and r.branch = $2
        and r.date >= date_trunc('month', $3::date)
        and r.date < date_trunc('month', $3::date) + interval '1 month'
    )
    select sum(s.part_sale) as part_sale, sum(s.labour_sale) as labour_sale
    from ssrv s
    join canc c on c.branch = s.branch and c.doc_key = s.inv and c.revenue_month = $1
    join accessories_staff a
      on a.branch = s.branch
     and lower(regexp_replace(a.name, '\\s+', ' ', 'g')) = lower(regexp_replace(s.close_sa_name, '\\s+', ' ', 'g'))
    where s.inv <> ''
    `,
    [month, branch, `${month}-01`]
  );

  const row = rows[0];
  if (!row || row.part_sale === null) return null; // no matching rows — sum() returns null, not 0, with zero groups
  return { partSale: Number(row.part_sale), labourSale: Number(row.labour_sale) };
}

/** Recomputes and upserts cancelled_accessories_adjustments for one
 * branch+month. Deletes any existing row first so a correction that used to
 * apply (e.g. a cancellation since reconciled, or an Accessories-staff name
 * change) doesn't linger forever — mirrors the old live query's behavior of
 * simply not appearing in the result map. */
export async function recomputeCancelledAccessoriesAdjustmentForBranchMonth(branch: string, month: string): Promise<void> {
  const adjustment = await computeCancelledAccessoriesAdjustmentForBranchMonth(branch, month);
  await pool.query(`delete from cancelled_accessories_adjustments where branch = $1 and revenue_month = $2`, [branch, month]);
  if (adjustment) {
    await pool.query(
      `insert into cancelled_accessories_adjustments (branch, revenue_month, part_sale, labour_sale) values ($1, $2, $3, $4)`,
      [branch, month, adjustment.partSale, adjustment.labourSale]
    );
  }
}

/** Every revenue month a branch currently has a cancellation recorded
 * against — used to recompute every month that could possibly need an
 * accessories adjustment after a cancellation upload (the upload's own
 * `month` is the cancel month, not necessarily the invoice's revenue
 * month, so this re-derives the real set rather than guessing one). */
export async function listCancellationRevenueMonthsForBranch(branch: string): Promise<string[]> {
  const { rows } = await pool.query<{ revenue_month: string }>(
    `select distinct coalesce(to_char(issue_date, 'YYYY-MM'), month) as revenue_month
     from invoice_cancellations where branch = $1`,
    [branch]
  );
  return rows.map((r) => r.revenue_month);
}
