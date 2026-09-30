import type { PoolClient } from "pg";
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
 * delete only ever touches the branches actually present in `rows`.
 *
 * Pass `contentHash` (SHA-256 of the parsed rows, same value hashRows()
 * returns) for service_info / ssrv089 / part_sale uploads — it is written
 * to raw_upload_batches in the same transaction, which turns the duplicate
 * check from a full-table scan into a single keyed lookup. Omit for ba_tool
 * and scom205 (they use their own duplicate-detection paths).
 *
 * Pass `client` to participate in a caller-managed transaction. The caller
 * must have already called BEGIN on that client and is responsible for
 * COMMIT/ROLLBACK/release. When omitted, this function manages its own
 * transaction. */
export async function saveRawUploadRows(
  params: {
    reportType: RawUploadReportType;
    date: string;
    uploadedAt: string;
    sourceFileName: string;
    rows: { branch: string; data: unknown }[];
    /** The admin account (username) that performed this upload — null for
     * uploads saved before this column existed, or for a script-driven
     * upload with no logged-in admin behind it (e.g. ba_tool). */
    uploadedBy?: string | null;
    /** SHA-256 of the parsed rows (hashRows() result). When provided, an
     * entry is upserted into raw_upload_batches in the same transaction. */
    contentHash?: string;
  },
  client?: PoolClient
): Promise<void> {
  const { reportType, date, uploadedAt, sourceFileName, rows, uploadedBy = null, contentHash } = params;

  const run = async (qc: Pick<PoolClient, "query">) => {
    const branchesInvolved = [...new Set(rows.map((r) => r.branch))];
    if (branchesInvolved.length > 0) {
      await qc.query(`delete from raw_upload_rows where report_type = $1 and date = $2 and branch = any($3::text[])`, [
        reportType,
        date,
        branchesInvolved,
      ]);
    }
    if (rows.length > 0) {
      const branches = rows.map((r) => r.branch);
      const rowIndexes = rows.map((_, i) => i);
      const rowDatas = rows.map((r) => JSON.stringify(r.data ?? {}));
      await qc.query(
        `insert into raw_upload_rows (report_type, date, branch, uploaded_at, source_file_name, row_index, row_data, uploaded_by)
         select $1, $2, b, $3, $4, i, d::jsonb, $8
         from unnest($5::text[], $6::int[], $7::text[]) as t(b, i, d)`,
        [reportType, date, uploadedAt, sourceFileName, branches, rowIndexes, rowDatas, uploadedBy]
      );
    }
    if (contentHash && branchesInvolved.length > 0) {
      for (const b of branchesInvolved) {
        await qc.query(
          `insert into raw_upload_batches (report_type, branch, date, content_hash, uploaded_at)
           values ($1, $2, $3, $4, $5)
           on conflict (report_type, branch, date) do update
             set content_hash = excluded.content_hash,
                 uploaded_at  = excluded.uploaded_at`,
          [reportType, b, date, contentHash, uploadedAt]
        );
      }
    }
  };

  if (client) {
    await run(client);
    return;
  }

  const ownClient = await pool.connect();
  try {
    await ownClient.query("begin");
    await run(ownClient);
    await ownClient.query("commit");
  } catch (err) {
    await ownClient.query("rollback");
    throw err;
  } finally {
    ownClient.release();
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

/** Fast duplicate-upload check — returns the date of the first prior batch
 * whose content hash matches `contentHash`, or null if no duplicate exists.
 * Replaces the old loadAllRawUploadRowsBefore + JS hash-loop approach
 * (which fetched all rows for every prior date and took ~6 s for large
 * branches). The strict `date < $3` condition mirrors the original exactly:
 * only prior dates are checked, not the same date or future dates. */
export async function findDuplicateBatch(
  reportType: RawUploadReportType,
  branch: string,
  beforeDate: string,
  contentHash: string
): Promise<string | null> {
  const { rows } = await pool.query<{ date: string }>(
    `select date::text as date
     from raw_upload_batches
     where report_type = $1 and branch = $2 and date < $3 and content_hash = $4
     limit 1`,
    [reportType, branch, beforeDate, contentHash]
  );
  return rows[0]?.date ?? null;
}

/** Every raw row from every upload strictly before `beforeDate` for one
 * report type/branch, grouped by date — the duplicate-upload check (see
 * duplicate-detection.ts) hashes each date's rows against a fresh upload to
 * spot a branch resending an *earlier* day's file under a new date, not
 * just the very last one: TI01C resent its 10 Sept file again on the 15th
 * with a real upload (the 14th) sitting in between, so comparing only
 * against the most recent prior day missed it entirely (caught
 * 2026-09-16). One query instead of one per candidate date. */
export async function loadAllRawUploadRowsBefore(
  reportType: RawUploadReportType,
  branch: string,
  beforeDate: string
): Promise<{ date: string; rows: unknown[] }[]> {
  const { rows } = await pool.query<{ date: string; row_data: unknown }>(
    `select date::text as date, row_data from raw_upload_rows
     where report_type = $1 and branch = $2 and date < $3
     order by date, row_index`,
    [reportType, branch, beforeDate]
  );
  const byDate = new Map<string, unknown[]>();
  for (const r of rows) {
    const list = byDate.get(r.date) ?? [];
    list.push(r.row_data);
    byDate.set(r.date, list);
  }
  return [...byDate.entries()].map(([date, rowData]) => ({ date, rows: rowData }));
}
