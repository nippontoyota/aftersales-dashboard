import { pool } from "../db";
import type { ParsedIncentiveSlabRow } from "./parse";

export type IncentiveSlabTargets = { slab1: number; slab2: number; slab3: number; slab4: number };
export type IncentiveSlabUploadInfo = { month: string; uploadedAt: string; uploadedBy: string; sourceFileName: string; branchCount: number };

/** This month's targets, one row per branch that has them — branches not in
 * the last upload for this month simply have no entry (dropped from the
 * ranking they'd otherwise show up in, same "no ratio, drops out" rule the
 * rest of the dashboard already follows for a missing target). */
export async function loadIncentiveSlabTargets(month: string): Promise<Map<string, IncentiveSlabTargets>> {
  const { rows } = await pool.query<{ branch: string; slab1: string; slab2: string; slab3: string; slab4: string }>(
    "select branch, slab1, slab2, slab3, slab4 from incentive_slab_targets where month = $1",
    [month]
  );
  return new Map(rows.map((r) => [r.branch, { slab1: Number(r.slab1), slab2: Number(r.slab2), slab3: Number(r.slab3), slab4: Number(r.slab4) }]));
}

/** The most recent upload's metadata for this month, for the /data admin
 * page's "currently loaded" status line — null if nothing uploaded yet. */
export async function loadIncentiveSlabUploadInfo(month: string): Promise<IncentiveSlabUploadInfo | null> {
  const { rows } = await pool.query<{ uploaded_at: Date; uploaded_by: string; source_file_name: string; branch_count: string }>(
    `select uploaded_at, uploaded_by, source_file_name, count(*) as branch_count
       from incentive_slab_targets
      where month = $1
      group by uploaded_at, uploaded_by, source_file_name
      order by uploaded_at desc
      limit 1`,
    [month]
  );
  const r = rows[0];
  if (!r) return null;
  return { month, uploadedAt: r.uploaded_at.toISOString(), uploadedBy: r.uploaded_by, sourceFileName: r.source_file_name, branchCount: Number(r.branch_count) };
}

/** All months that currently have targets loaded, most recent first — for
 * the /data admin page's month picker. */
export async function listIncentiveSlabMonths(): Promise<string[]> {
  const { rows } = await pool.query<{ month: string }>("select distinct month from incentive_slab_targets order by month desc");
  return rows.map((r) => r.month);
}

/** Full replace for one month — same delete-then-insert-in-one-transaction
 * semantics as ba_tool_snapshots' saveSnapshot(), so a corrected re-upload
 * never leaves a stale branch's old target behind. */
export async function saveIncentiveSlabTargets(
  month: string,
  rows: ParsedIncentiveSlabRow[],
  uploadedBy: string,
  sourceFileName: string
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("delete from incentive_slab_targets where month = $1", [month]);
    const uploadedAt = new Date().toISOString();
    for (const row of rows) {
      await client.query(
        `insert into incentive_slab_targets (month, branch, slab1, slab2, slab3, slab4, uploaded_at, uploaded_by, source_file_name)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [month, row.branch, row.slab1, row.slab2, row.slab3, row.slab4, uploadedAt, uploadedBy, sourceFileName]
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
