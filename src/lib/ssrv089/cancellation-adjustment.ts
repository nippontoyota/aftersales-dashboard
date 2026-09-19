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
 */
export type CancelledAccessoriesAdjustment = {
  partSale: number;
  labourSale: number;
};

function toNumericExpr(column: string): string {
  return `coalesce(nullif(regexp_replace(coalesce(r.row_data->>'${column}', ''), '[^0-9.\\-]', '', 'g'), '')::numeric, 0)`;
}

export async function loadCancelledAccessoriesAdjustmentForMonth(
  date: string
): Promise<Map<string, CancelledAccessoriesAdjustment>> {
  const monthPrefix = date.slice(0, 7); // YYYY-MM

  const { rows } = await pool.query<{ branch: string; part_sale: string; labour_sale: string }>(
    `
    with canc as (
      select branch, replace(doc_no, '-', '') as doc_key,
             coalesce(to_char(issue_date, 'YYYY-MM'), month) as revenue_month
      from invoice_cancellations
    ),
    ssrv as (
      select r.branch,
             replace(coalesce(r.row_data->>'Invoice Doc No.', ''), '-', '') as inv,
             trim(coalesce(r.row_data->>'Close SA Name', '')) as close_sa_name,
             ${toNumericExpr("Part Sale")} as part_sale,
             ${toNumericExpr("Labour Sale")} as labour_sale
      from raw_upload_rows r
      where r.report_type = 'ssrv089' and to_char(r.date, 'YYYY-MM') = $1
    )
    select s.branch,
           sum(s.part_sale) as part_sale,
           sum(s.labour_sale) as labour_sale
    from ssrv s
    join canc c on c.branch = s.branch and c.doc_key = s.inv and c.revenue_month = $1
    join accessories_staff a
      on a.branch = s.branch
     and lower(regexp_replace(a.name, '\\s+', ' ', 'g')) = lower(regexp_replace(s.close_sa_name, '\\s+', ' ', 'g'))
    where s.inv <> ''
    group by s.branch
    `,
    [monthPrefix]
  );

  return new Map(rows.map((r) => [r.branch, { partSale: Number(r.part_sale), labourSale: Number(r.labour_sale) }]));
}
