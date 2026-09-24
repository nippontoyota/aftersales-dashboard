import { pool } from "../db";
import type { Scom205StockAndServiceRate, Scom205Totals } from "./parse";

/** scom205_snapshots — one row per branch per date. Values are already MTD-cumulative in the source file, so a given date's row is just that day's read — no accumulation across days needed. */
export type Scom205Snapshot = {
  date: string; // YYYY-MM-DD
  branch: string;
  uploadedAt: string; // ISO timestamp
  sourceFileName: string;
  totals: Scom205Totals;
  /** From sheet 3 ("Service Parts Sales & Stock") — null when that sheet was
   * missing/unrecognized at upload time, or for rows saved before this field
   * existed (see db/schema.sql). */
  stockAndServiceRate: Scom205StockAndServiceRate | null;
};

export async function saveScom205Snapshot(snapshot: Scom205Snapshot): Promise<void> {
  await pool.query(
    `insert into scom205_snapshots
       (date, branch, uploaded_at, source_file_name, gus_sp_rev_mtd, gus_lab_rev_mtd, bpu_sp_rev_mtd, bpu_lab_rev_mtd, stock_month_tgp, sr_lines_total_pct)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (date, branch) do update set
       uploaded_at = excluded.uploaded_at,
       source_file_name = excluded.source_file_name,
       gus_sp_rev_mtd = excluded.gus_sp_rev_mtd,
       gus_lab_rev_mtd = excluded.gus_lab_rev_mtd,
       bpu_sp_rev_mtd = excluded.bpu_sp_rev_mtd,
       bpu_lab_rev_mtd = excluded.bpu_lab_rev_mtd,
       stock_month_tgp = excluded.stock_month_tgp,
       sr_lines_total_pct = excluded.sr_lines_total_pct`,
    [
      snapshot.date,
      snapshot.branch,
      snapshot.uploadedAt,
      snapshot.sourceFileName,
      snapshot.totals.gusSpRevMtd,
      snapshot.totals.gusLabRevMtd,
      snapshot.totals.bpuSpRevMtd,
      snapshot.totals.bpuLabRevMtd,
      snapshot.stockAndServiceRate?.stockMonthTgp ?? null,
      snapshot.stockAndServiceRate?.srLinesTotalPct ?? null,
    ]
  );
}

function rowToStockAndServiceRate(r: {
  stock_month_tgp: string | null;
  sr_lines_total_pct: string | null;
}): Scom205StockAndServiceRate | null {
  if (r.stock_month_tgp === null || r.sr_lines_total_pct === null) return null;
  return { stockMonthTgp: Number(r.stock_month_tgp), srLinesTotalPct: Number(r.sr_lines_total_pct) };
}

export async function loadScom205Snapshot(date: string, branch: string): Promise<Scom205Snapshot | null> {
  const { rows } = await pool.query(
    `select uploaded_at, source_file_name, gus_sp_rev_mtd, gus_lab_rev_mtd, bpu_sp_rev_mtd, bpu_lab_rev_mtd, stock_month_tgp, sr_lines_total_pct
     from scom205_snapshots where date = $1 and branch = $2`,
    [date, branch]
  );
  const r = rows[0];
  if (!r) return null;

  return {
    date,
    branch,
    uploadedAt: (r.uploaded_at as Date).toISOString(),
    sourceFileName: r.source_file_name,
    totals: {
      gusSpRevMtd: Number(r.gus_sp_rev_mtd),
      gusLabRevMtd: Number(r.gus_lab_rev_mtd),
      bpuSpRevMtd: Number(r.bpu_sp_rev_mtd),
      bpuLabRevMtd: Number(r.bpu_lab_rev_mtd),
    },
    stockAndServiceRate: rowToStockAndServiceRate(r),
  };
}

/** Every snapshot strictly before `date` for one branch — the
 * duplicate-upload check (see duplicate-detection.ts) compares a fresh
 * upload's totals against *all* of these, not just the most recent one:
 * TI01C resent its 10 Sept file again on the 15th, five days later and with
 * a real upload (the 14th) in between, so comparing only against the
 * immediately preceding day missed it entirely (caught 2026-09-16). scom205
 * has no row list to hash, but its four totals are cumulative-MTD, so an
 * exact match against any earlier day is just as strong a signal as a fresh
 * one. */
export async function loadAllScom205SnapshotsBefore(date: string, branch: string): Promise<Scom205Snapshot[]> {
  const { rows } = await pool.query<{
    date: string;
    uploaded_at: Date;
    source_file_name: string;
    gus_sp_rev_mtd: string;
    gus_lab_rev_mtd: string;
    bpu_sp_rev_mtd: string;
    bpu_lab_rev_mtd: string;
    stock_month_tgp: string | null;
    sr_lines_total_pct: string | null;
  }>(
    `select date::text as date, uploaded_at, source_file_name, gus_sp_rev_mtd, gus_lab_rev_mtd, bpu_sp_rev_mtd, bpu_lab_rev_mtd, stock_month_tgp, sr_lines_total_pct
     from scom205_snapshots where branch = $1 and date < $2
     order by date desc`,
    [branch, date]
  );
  return rows.map((r) => ({
    date: r.date,
    branch,
    uploadedAt: r.uploaded_at.toISOString(),
    sourceFileName: r.source_file_name,
    totals: {
      gusSpRevMtd: Number(r.gus_sp_rev_mtd),
      gusLabRevMtd: Number(r.gus_lab_rev_mtd),
      bpuSpRevMtd: Number(r.bpu_sp_rev_mtd),
      bpuLabRevMtd: Number(r.bpu_lab_rev_mtd),
    },
    stockAndServiceRate: rowToStockAndServiceRate(r),
  }));
}

/** All branches' snapshots for exactly one date — one query instead of one per branch, used when building the full dashboard report. Values are already MTD-cumulative, so unlike the other sources there's no "for the month" bulk loader needed. */
export async function loadAllScom205SnapshotsForDate(date: string): Promise<Scom205Snapshot[]> {
  const { rows } = await pool.query(
    `select branch, uploaded_at, source_file_name, gus_sp_rev_mtd, gus_lab_rev_mtd, bpu_sp_rev_mtd, bpu_lab_rev_mtd, stock_month_tgp, sr_lines_total_pct
     from scom205_snapshots where date = $1`,
    [date]
  );
  return rows.map((r) => ({
    date,
    branch: r.branch as string,
    uploadedAt: (r.uploaded_at as Date).toISOString(),
    sourceFileName: r.source_file_name as string,
    totals: {
      gusSpRevMtd: Number(r.gus_sp_rev_mtd),
      gusLabRevMtd: Number(r.gus_lab_rev_mtd),
      bpuSpRevMtd: Number(r.bpu_sp_rev_mtd),
      bpuLabRevMtd: Number(r.bpu_lab_rev_mtd),
    },
    stockAndServiceRate: rowToStockAndServiceRate(r),
  }));
}

/** How many distinct branches have uploaded their scom205 for `date` — the
 * real "uploaded branch count" for the DraftWarning banner. Unlike
 * report.branches.length (which counts BA Tool rows, always all 18/19 since
 * HQ uploads a single file covering everyone), this counts per-branch
 * uploads and correctly returns e.g. 12 when only 12 branches have filed. */
export async function countScom205BranchesForDate(date: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `select count(*)::text as count from scom205_snapshots where date = $1`,
    [date]
  );
  return Number(rows[0]?.count ?? 0);
}
