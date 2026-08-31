import { pool } from "../db";
import type { Ssrv089Totals } from "./parse";

export type Ssrv089Variant = "general" | "body_paint";

/** ssrv089_snapshots — one row per branch per date per variant (General / Body & Paint), stored separately per the user. */
export type Ssrv089Snapshot = {
  date: string; // YYYY-MM-DD
  branch: string;
  variant: Ssrv089Variant;
  uploadedAt: string; // ISO timestamp
  sourceFileName: string;
  totals: Ssrv089Totals;
};

export async function saveSsrv089Snapshot(snapshot: Ssrv089Snapshot): Promise<void> {
  await pool.query(
    `insert into ssrv089_snapshots
       (date, branch, variant, uploaded_at, source_file_name, accessories_part_sale, accessories_labour_sale)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (date, branch, variant) do update set
       uploaded_at = excluded.uploaded_at,
       source_file_name = excluded.source_file_name,
       accessories_part_sale = excluded.accessories_part_sale,
       accessories_labour_sale = excluded.accessories_labour_sale`,
    [
      snapshot.date,
      snapshot.branch,
      snapshot.variant,
      snapshot.uploadedAt,
      snapshot.sourceFileName,
      snapshot.totals.accessoriesPartSale,
      snapshot.totals.accessoriesLabourSale,
    ]
  );
}

export async function loadSsrv089Snapshot(date: string, branch: string, variant: Ssrv089Variant): Promise<Ssrv089Snapshot | null> {
  const { rows } = await pool.query(
    `select uploaded_at, source_file_name, accessories_part_sale, accessories_labour_sale
     from ssrv089_snapshots where date = $1 and branch = $2 and variant = $3`,
    [date, branch, variant]
  );
  const r = rows[0];
  if (!r) return null;

  return {
    date,
    branch,
    variant,
    uploadedAt: (r.uploaded_at as Date).toISOString(),
    sourceFileName: r.source_file_name,
    totals: {
      accessoriesPartSale: Number(r.accessories_part_sale),
      accessoriesLabourSale: Number(r.accessories_labour_sale),
    },
  };
}

/** All of one branch's snapshots of one variant in the same calendar month as `date`, up to and including it — used for MTD accumulation (GUS Parts/Labour MTD needs the 'general' variant's running total). */
export async function loadSsrv089SnapshotsForMonthUpTo(
  date: string,
  branch: string,
  variant: Ssrv089Variant
): Promise<Ssrv089Snapshot[]> {
  const monthPrefix = date.slice(0, 7); // YYYY-MM
  const { rows } = await pool.query<{ date: string }>(
    `select distinct date::text as date from ssrv089_snapshots
     where branch = $1 and variant = $2 and date::text like $3 and date <= $4
     order by date`,
    [branch, variant, `${monthPrefix}%`, date]
  );
  const snapshots = await Promise.all(rows.map((r) => loadSsrv089Snapshot(r.date, branch, variant)));
  return snapshots.filter((s): s is Ssrv089Snapshot => s !== null);
}

function rowToSnapshot(r: Record<string, unknown>, variant: Ssrv089Variant): Ssrv089Snapshot {
  return {
    date: r.date as string,
    branch: r.branch as string,
    variant,
    uploadedAt: (r.uploaded_at as Date).toISOString(),
    sourceFileName: r.source_file_name as string,
    totals: {
      accessoriesPartSale: Number(r.accessories_part_sale),
      accessoriesLabourSale: Number(r.accessories_labour_sale),
    },
  };
}

/** All branches' snapshots of one variant for exactly one date — one query instead of one per branch, used when building the full dashboard report. */
export async function loadAllSsrv089SnapshotsForDate(date: string, variant: Ssrv089Variant): Promise<Ssrv089Snapshot[]> {
  const { rows } = await pool.query(
    `select date::text as date, branch, uploaded_at, source_file_name, accessories_part_sale, accessories_labour_sale
     from ssrv089_snapshots where date = $1 and variant = $2`,
    [date, variant]
  );
  return rows.map((r) => rowToSnapshot(r, variant));
}

/** All branches' snapshots of one variant in the same calendar month as `date`, up to and including it — one query instead of one per branch. */
export async function loadAllSsrv089SnapshotsForMonthUpTo(date: string, variant: Ssrv089Variant): Promise<Ssrv089Snapshot[]> {
  const monthPrefix = date.slice(0, 7);
  const { rows } = await pool.query(
    `select date::text as date, branch, uploaded_at, source_file_name, accessories_part_sale, accessories_labour_sale
     from ssrv089_snapshots where variant = $1 and date::text like $2 and date <= $3`,
    [variant, `${monthPrefix}%`, date]
  );
  return rows.map((r) => rowToSnapshot(r, variant));
}
