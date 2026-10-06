import type { PoolClient } from "pg";

/** Only these tables may be logged/deleted through this helper — a fixed
 * allowlist, not a free-form table name, since `tableName` is interpolated
 * directly into SQL (always a hardcoded literal at the call site, never
 * user input, but this still stops a typo from becoming a SQL-injection
 * shaped footgun). Add to this list before adding a new call site. */
const AUDITABLE_TABLES = new Set([
  "raw_upload_rows",
  "service_info_snapshots",
  "ssrv089_snapshots",
  "part_sale_snapshots",
  "scom205_snapshots",
  "raw_report_uploads",
]);

/** Snapshots every row a delete is about to remove into `deleted_rows_log`,
 * via a single `insert ... select` (no round-trip of the rows through JS) —
 * call this immediately before the matching `delete`, using the exact same
 * `whereSql`/`params` and the same transaction, so a rolled-back delete
 * never leaves a stray log entry. `source` identifies which code path did
 * it (e.g. "saveRawUploadRows", "reset-branch-uploads.mjs") — that plus
 * `deleted_at` is enough to answer a future "where did this go" without the
 * forensic reconstruction this was added after (TI01B's September
 * SSRV089/Part Sale data, deleted with no trace anywhere).
 *
 * `columns` lets a caller exclude a large/binary column (e.g.
 * raw_report_uploads' `file_data bytea`) from the logged snapshot — pass
 * everything except it rather than `*`. */
export async function logDeletedRows(
  client: Pick<PoolClient, "query">,
  tableName: string,
  source: string,
  whereSql: string,
  params: unknown[],
  columns = "*"
): Promise<number> {
  if (!AUDITABLE_TABLES.has(tableName)) {
    throw new Error(`logDeletedRows: "${tableName}" is not in AUDITABLE_TABLES — add it there first.`);
  }
  const tableNameParamIdx = params.length + 1;
  const sourceParamIdx = params.length + 2;
  const result = await client.query(
    `insert into deleted_rows_log (table_name, source, row_data)
     select $${tableNameParamIdx}, $${sourceParamIdx}, row_to_json(t)::jsonb
     from (select ${columns} from ${tableName} where ${whereSql}) t`,
    [...params, tableName, source]
  );
  return result.rowCount ?? 0;
}
