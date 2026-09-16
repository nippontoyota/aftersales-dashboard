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

/** Every upload strictly before `beforeDate` for one branch/report type,
 * file bytes included — the one caller that does want file_data back: the
 * duplicate-upload check (see duplicate-detection.ts) hashes each of these
 * against a fresh upload, not just the most recent one, since these two
 * report types keep no parsed rows to compare instead. Comparing against
 * every prior date (not just the last) matters here the same way it does
 * for the other report types — see raw-upload-rows/store.ts's equivalent
 * function for the TI01C case that motivated this. */
export async function loadAllRawReportUploadsBefore(
  branch: string,
  reportType: RawReportType,
  beforeDate: string
): Promise<{ date: string; sourceFileName: string; fileData: Buffer }[]> {
  const { rows } = await pool.query<{ date: string; source_file_name: string; file_data: Buffer }>(
    `select date::text as date, source_file_name, file_data from raw_report_uploads
     where branch = $1 and report_type = $2 and date < $3
     order by date desc`,
    [branch, reportType, beforeDate]
  );
  return rows.map((r) => ({ date: r.date, sourceFileName: r.source_file_name, fileData: r.file_data }));
}

/** Every branch that's uploaded a given report type for a date, in one
 * query — the pending-uploads view needs "who's done vs. who hasn't" across
 * all 20 branches, not a one-branch lock check. */
export async function loadAllRawReportUploadsForDate(date: string, reportType: RawReportType): Promise<{ branch: string }[]> {
  const { rows } = await pool.query<{ branch: string }>(`select branch from raw_report_uploads where date = $1 and report_type = $2`, [
    date,
    reportType,
  ]);
  return rows;
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
