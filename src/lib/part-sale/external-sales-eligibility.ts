import { pool } from "../db";

/** An F-type return only nets against External Sales when its original
 * A-type bill was filed in the same calendar month as the return itself
 * (2026-09-21, at the user's request) — a month is closed and incentives
 * paid out on its figures, so a return crossing into a later month would
 * otherwise retroactively disturb a number that's already been acted on.
 * A return whose original bill can't be found in our data at all (never
 * uploaded, or predates when we started tracking that branch) is treated
 * the same as cross-month — we can't prove it's same-month, so it doesn't
 * net either. Looks up every distinct RefDocNo in one query rather than
 * one per row. */
export async function eligibleSameMonthFTypeRefDocs(
  branch: string,
  uploadDate: string,
  refDocNos: string[]
): Promise<Set<string>> {
  const unique = [...new Set(refDocNos)].filter(Boolean);
  const eligible = new Set<string>();
  if (unique.length === 0) return eligible;

  const uploadMonth = uploadDate.slice(0, 7);
  const { rows } = await pool.query<{ bill_no: string; original_month: string }>(
    `select row_data->>'BillNo' as bill_no, min(date::text) as original_month
       from raw_upload_rows
      where report_type = 'part_sale' and branch = $1 and row_data->>'BillNo' = any($2::text[])
      group by row_data->>'BillNo'`,
    [branch, unique]
  );
  for (const r of rows) {
    if (r.original_month.slice(0, 7) === uploadMonth) eligible.add(r.bill_no);
  }
  return eligible;
}
