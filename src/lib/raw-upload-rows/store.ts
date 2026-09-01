import { pool } from "../db";

/** Every row of every uploaded file, verbatim (see db/schema.sql's
 * raw_upload_rows) — the parsed snapshot tables only ever kept computed
 * totals, so this is the piece that lets a later question (a new formula, a
 * correction, an audit) be answered by querying instead of hunting down the
 * original file again. */
export type RawUploadReportType = "service_info" | "ssrv089" | "part_sale" | "scom205" | "ba_tool";

/** Saves every row from one upload, replacing whatever was previously saved
 * for the exact (reportType, date, branch) combos this upload covers — a
 * correction re-upload shouldn't leave stale rows behind alongside the new
 * ones. Scoped per-branch (not a bare report_type+date wipe) because
 * several branches legitimately share a date: 19 other branches' own
 * Service Info rows for today must survive one branch re-uploading theirs,
 * and BA Tool's single file spans every branch's row in one go — so the
 * delete only ever touches the branches actually present in `rows`. */
export async function saveRawUploadRows(params: {
  reportType: RawUploadReportType;
  date: string;
  uploadedAt: string;
  sourceFileName: string;
  rows: { branch: string; data: unknown }[];
}): Promise<void> {
  const { reportType, date, uploadedAt, sourceFileName, rows } = params;
  const client = await pool.connect();
  try {
    await client.query("begin");

    const branchesInvolved = [...new Set(rows.map((r) => r.branch))];
    if (branchesInvolved.length > 0) {
      await client.query(`delete from raw_upload_rows where report_type = $1 and date = $2 and branch = any($3::text[])`, [
        reportType,
        date,
        branchesInvolved,
      ]);
    }

    if (rows.length > 0) {
      const branches = rows.map((r) => r.branch);
      const rowIndexes = rows.map((_, i) => i);
      const rowDatas = rows.map((r) => JSON.stringify(r.data ?? {}));
      await client.query(
        `insert into raw_upload_rows (report_type, date, branch, uploaded_at, source_file_name, row_index, row_data)
         select $1, $2, b, $3, $4, i, d::jsonb
         from unnest($5::text[], $6::int[], $7::text[]) as t(b, i, d)`,
        [reportType, date, uploadedAt, sourceFileName, branches, rowIndexes, rowDatas]
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

/** Every raw row on file for one report type / date / branch — for
 * recomputing something later without needing the original file back. */
export async function loadRawUploadRows(reportType: RawUploadReportType, date: string, branch: string): Promise<unknown[]> {
  const { rows } = await pool.query<{ row_data: unknown }>(
    `select row_data from raw_upload_rows where report_type = $1 and date = $2 and branch = $3 order by row_index`,
    [reportType, date, branch]
  );
  return rows.map((r) => r.row_data);
}
