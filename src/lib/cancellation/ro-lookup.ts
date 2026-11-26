import { pool } from "../db";

/**
 * Looks up a branch-entered "rebilled under this RO" number against
 * SSRV089/SSRV089-BP, for the justification form's immediate feedback
 * (see justification-actions.ts) — same dedup/numeric-parsing approach as
 * cross-month-replacement.ts's ssrv_dedup, just scoped to one RO instead of
 * joined against every cancellation. Not used by reconcile.ts or
 * cross-month-replacement.ts themselves, which match live in SQL once the
 * link is approved — this is purely a submit-time sanity check so a typo'd
 * RO doesn't silently save as unmatched with no feedback.
 */
export type RoLookupResult = {
  invoiceDocNo: string;
  month: string;
  date: string;
  partSale: number;
  labourSale: number;
};

function toNumericExpr(column: string): string {
  return `coalesce(nullif(regexp_replace(coalesce(r.row_data->>'${column}', ''), '[^0-9.\\-]', '', 'g'), '')::numeric, 0)`;
}

/** Most recent live (never-cancelled) invoice found under `ro` for `branch`,
 * from `fromDate` onward — a rebill can only land on/after the cancelled
 * invoice's own revenue date, so bounding the scan there keeps this cheap. */
export async function lookupRoInvoice(branch: string, ro: string, fromDate: string): Promise<RoLookupResult | null> {
  const roKey = ro.replace(/-/g, "").trim().toUpperCase();
  if (!roKey) return null;

  const { rows } = await pool.query<{
    inv: string;
    row_month: string;
    row_date: string;
    part_sale: string;
    labour_sale: string;
  }>(
    `
    with ssrv_dedup as (
      select inv, row_month,
             max(part_sale) as part_sale, max(oil_sale) as oil_sale, max(pnt_mat_sale) as pnt_mat_sale,
             max(labour_sale) as labour_sale, max(row_date) as row_date
      from (
        select replace(upper(coalesce(r.row_data->>'Invoice Doc No.', '')), '-', '') as inv,
               to_char(r.date, 'YYYY-MM') as row_month,
               r.date as row_date,
               ${toNumericExpr("Part Sale")} as part_sale,
               ${toNumericExpr("Oil Sale")} as oil_sale,
               ${toNumericExpr("Pnt Mat Sale")} as pnt_mat_sale,
               ${toNumericExpr("Labour Sale")} as labour_sale
        from raw_upload_rows r
        where r.report_type in ('ssrv089', 'ssrv089_bp')
          and r.branch = $1
          and r.date >= $2::date
          and replace(upper(coalesce(r.row_data->>'JobOrder No', '')), '-', '') = $3
      ) x
      group by inv, row_month
    )
    select inv, row_month, row_date::text, part_sale + oil_sale + pnt_mat_sale as part_sale, labour_sale
    from ssrv_dedup
    where inv <> ''
      and not exists (select 1 from invoice_cancellations ic where ic.branch = $1 and replace(upper(ic.doc_no), '-', '') = ssrv_dedup.inv)
    order by row_date desc
    limit 1
    `,
    [branch, fromDate, roKey]
  );

  const row = rows[0];
  if (!row) return null;
  return {
    invoiceDocNo: row.inv,
    month: row.row_month,
    date: row.row_date,
    partSale: Number(row.part_sale),
    labourSale: Number(row.labour_sale),
  };
}
