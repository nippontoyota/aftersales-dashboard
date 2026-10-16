import type { PoolClient } from "pg";
import { pool } from "../db";
import type { LabourSalesCounts } from "./parse";

/** labour_sales_snapshots — one row per branch per real calendar date (see
 * db/schema.sql's doc comment on why date comes from the file's own Doc.
 * Date, not a picked upload date). Upsert on (date, branch): a re-upload
 * overwrites whichever dates it contains. */
export type LabourSalesSnapshot = {
  date: string; // YYYY-MM-DD
  branch: string;
  uploadedAt: string; // ISO timestamp
  sourceFileName: string;
  counts: LabourSalesCounts;
  uploadedBy?: string | null;
};

/** Pass `client` to run inside a caller-managed transaction. */
export async function saveLabourSalesSnapshot(snapshot: LabourSalesSnapshot, client?: PoolClient): Promise<void> {
  await (client ?? pool).query(
    `insert into labour_sales_snapshots
       (date, branch, uploaded_at, source_file_name, row_count, total_labour_before, total_labour_after, vas_labour_before, vas_labour_after, gs_ro_count, bp_ro_count, uploaded_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     on conflict (date, branch) do update set
       uploaded_at = excluded.uploaded_at,
       source_file_name = excluded.source_file_name,
       row_count = excluded.row_count,
       total_labour_before = excluded.total_labour_before,
       total_labour_after = excluded.total_labour_after,
       vas_labour_before = excluded.vas_labour_before,
       vas_labour_after = excluded.vas_labour_after,
       gs_ro_count = excluded.gs_ro_count,
       bp_ro_count = excluded.bp_ro_count,
       uploaded_by = excluded.uploaded_by`,
    [
      snapshot.date,
      snapshot.branch,
      snapshot.uploadedAt,
      snapshot.sourceFileName,
      snapshot.counts.rowCount,
      snapshot.counts.totalLabourBefore,
      snapshot.counts.totalLabourAfter,
      snapshot.counts.vasLabourBefore,
      snapshot.counts.vasLabourAfter,
      snapshot.counts.gsRoCount,
      snapshot.counts.bpRoCount,
      snapshot.uploadedBy ?? null,
    ]
  );
}

function rowToSnapshot(r: Record<string, unknown>): LabourSalesSnapshot {
  return {
    date: r.date as string,
    branch: r.branch as string,
    uploadedAt: (r.uploaded_at as Date).toISOString(),
    sourceFileName: r.source_file_name as string,
    counts: {
      rowCount: Number(r.row_count),
      totalLabourBefore: Number(r.total_labour_before),
      totalLabourAfter: Number(r.total_labour_after),
      vasLabourBefore: Number(r.vas_labour_before),
      vasLabourAfter: Number(r.vas_labour_after),
      gsRoCount: Number(r.gs_ro_count),
      bpRoCount: Number(r.bp_ro_count),
    },
  };
}

const SELECT_COLUMNS =
  "date::text as date, branch, uploaded_at, source_file_name, row_count, total_labour_before, total_labour_after, vas_labour_before, vas_labour_after, gs_ro_count, bp_ro_count";

export async function loadLabourSalesSnapshot(date: string, branch: string): Promise<LabourSalesSnapshot | null> {
  const { rows } = await pool.query(`select ${SELECT_COLUMNS} from labour_sales_snapshots where date = $1 and branch = $2`, [date, branch]);
  const r = rows[0];
  return r ? rowToSnapshot(r) : null;
}

/** All of one branch's snapshots in the same calendar month as `date`. */
export async function loadLabourSalesSnapshotsForMonth(branch: string, yearMonth: string): Promise<LabourSalesSnapshot[]> {
  const { rows } = await pool.query(`select ${SELECT_COLUMNS} from labour_sales_snapshots where branch = $1 and date::text like $2 order by date`, [
    branch,
    `${yearMonth}%`,
  ]);
  return rows.map(rowToSnapshot);
}

/** All branches' snapshots for exactly one date — used by pending-uploads.ts
 * to check "has this branch's Labour Sales Report covered this date yet",
 * the same presence check that works whether the date came from today's
 * single-day upload or an earlier multi-day backfill file. */
export async function loadAllLabourSalesSnapshotsForDate(date: string): Promise<LabourSalesSnapshot[]> {
  const { rows } = await pool.query(`select ${SELECT_COLUMNS} from labour_sales_snapshots where date = $1`, [date]);
  return rows.map(rowToSnapshot);
}

/** Whether date (YYYY-MM-DD) falls on a Sunday (UTC). */
function isSunday(date: string): boolean {
  return new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
}

/** The Saturday before a Sunday date, as YYYY-MM-DD. */
function previousSaturday(sundayDate: string): string {
  return new Date(new Date(`${sundayDate}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
}

/** "Uploaded for this reporting window" check for one branch. Labour Sales doc
 * dates come from the file itself, so a branch that only worked Saturday files
 * under Saturday — not Sunday — even though Sunday is the canonical report
 * date for that round. This treats a Saturday snapshot as equivalent to the
 * Sunday that follows it, matching the same window logic used in
 * loadAllLabourSalesSnapshotsForWindow for the HQ pending panel. */
export async function loadLabourSalesSnapshotForWindow(date: string, branch: string): Promise<LabourSalesSnapshot | null> {
  const exact = await loadLabourSalesSnapshot(date, branch);
  if (exact) return exact;
  if (!isSunday(date)) return null;
  return loadLabourSalesSnapshot(previousSaturday(date), branch);
}

/** All branches for a reporting window — same Saturday-fold as
 * loadLabourSalesSnapshotForWindow. On a Sunday, unions both the Sunday and
 * the Saturday before it; Sunday snapshot wins when a branch has both. */
export async function loadAllLabourSalesSnapshotsForWindow(date: string): Promise<LabourSalesSnapshot[]> {
  if (!isSunday(date)) return loadAllLabourSalesSnapshotsForDate(date);
  const [sunday, saturday] = await Promise.all([
    loadAllLabourSalesSnapshotsForDate(date),
    loadAllLabourSalesSnapshotsForDate(previousSaturday(date)),
  ]);
  const byBranch = new Map<string, LabourSalesSnapshot>();
  for (const s of saturday) byBranch.set(s.branch, s);
  for (const s of sunday) byBranch.set(s.branch, s); // Sunday overwrites
  return [...byBranch.values()];
}
