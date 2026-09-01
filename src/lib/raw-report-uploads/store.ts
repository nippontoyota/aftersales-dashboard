import { pool } from "../db";

/** Service Information Report - BP and Cost and Sales Report - BP — two
 * required daily uploads with nothing parsed out of them (see
 * db/schema.sql's raw_report_uploads). The file bytes are kept, not
 * discarded, so there's something to look at later if a real use for this
 * data ever comes up — but today this store is purely "was this uploaded,
 * and by whom, and when," matching what every other report type's lock
 * check already needs. */
export type RawReportType = "service_info_bp" | "ssrv089_bp";

export type RawReportUploadMeta = {
  sourceFileName: string;
  uploadedAt: string;
};

/** Metadata only — never pulls file_data back out. The one place that could
 * ever want the actual bytes (a future "download what was uploaded"
 * feature) doesn't exist yet; every current caller only needs to answer
 * "has this been uploaded" for the lock check and the Upload Sheet flow. */
export async function loadRawReportUpload(date: string, branch: string, reportType: RawReportType): Promise<RawReportUploadMeta | null> {
  const { rows } = await pool.query<{ source_file_name: string; uploaded_at: string }>(
    `select source_file_name, uploaded_at from raw_report_uploads where date = $1 and branch = $2 and report_type = $3`,
    [date, branch, reportType]
  );
  return rows[0] ? { sourceFileName: rows[0].source_file_name, uploadedAt: rows[0].uploaded_at } : null;
}

/** Upserts on (date, branch, report_type) — branches are blocked from
 * re-uploading by the lock check in each API route before this ever runs,
 * but HQ's Upload Sheet correction path needs to freely overwrite, same as
 * every other report type's save function. */
export async function saveRawReportUpload(params: {
  date: string;
  branch: string;
  reportType: RawReportType;
  uploadedAt: string;
  sourceFileName: string;
  fileData: Buffer;
}): Promise<void> {
  await pool.query(
    `insert into raw_report_uploads (date, branch, report_type, uploaded_at, source_file_name, file_data)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (date, branch, report_type) do update set
       uploaded_at = excluded.uploaded_at,
       source_file_name = excluded.source_file_name,
       file_data = excluded.file_data`,
    [params.date, params.branch, params.reportType, params.uploadedAt, params.sourceFileName, params.fileData]
  );
}
