import type { PoolClient } from "pg";
import { pool } from "../db";
import type { Ssrv089BpGreyTotals } from "./parse";

/** Only the Grey-brand totals from a Cost and Sales Report - BP upload — the
 * rest of that report stays unparsed (see raw-report-uploads/store.ts). One
 * row per branch per date, same MTD-accumulation shape as ssrv089_snapshots. */
export type Ssrv089BpGreySnapshot = {
  date: string; // YYYY-MM-DD
  branch: string;
  uploadedAt: string; // ISO timestamp
  sourceFileName: string;
  totals: Ssrv089BpGreyTotals;
};

export async function saveSsrv089BpGreySnapshot(snapshot: Ssrv089BpGreySnapshot, client?: PoolClient): Promise<void> {
  await (client ?? pool).query(
    `insert into ssrv089_bp_grey_snapshots (date, branch, uploaded_at, source_file_name, grey_parts_sale, grey_labour_sale)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (date, branch) do update set
       uploaded_at = excluded.uploaded_at,
       source_file_name = excluded.source_file_name,
       grey_parts_sale = excluded.grey_parts_sale,
       grey_labour_sale = excluded.grey_labour_sale`,
    [snapshot.date, snapshot.branch, snapshot.uploadedAt, snapshot.sourceFileName, snapshot.totals.greyPartsSale, snapshot.totals.greyLabourSale]
  );
}

function rowToSnapshot(r: Record<string, unknown>): Ssrv089BpGreySnapshot {
  return {
    date: r.date as string,
    branch: r.branch as string,
    uploadedAt: (r.uploaded_at as Date).toISOString(),
    sourceFileName: r.source_file_name as string,
    totals: {
      greyPartsSale: Number(r.grey_parts_sale),
      greyLabourSale: Number(r.grey_labour_sale),
    },
  };
}

/** All branches' snapshots in the same calendar month as `date`, up to and including it — one query instead of one per branch, used by report.ts's BPU Parts/Labour MTD formula. */
export async function loadAllSsrv089BpGreySnapshotsForMonthUpTo(date: string): Promise<Ssrv089BpGreySnapshot[]> {
  const monthPrefix = date.slice(0, 7);
  const { rows } = await pool.query(
    `select date::text as date, branch, uploaded_at, source_file_name, grey_parts_sale, grey_labour_sale
     from ssrv089_bp_grey_snapshots where date::text like $1 and date <= $2`,
    [`${monthPrefix}%`, date]
  );
  return rows.map(rowToSnapshot);
}
