import { pool } from "../db";
import type { PartSaleCounts } from "./parse";

/** part_sale_snapshots — one row per branch per date (see db/schema.sql). Upsert on (date, branch) since each branch uploads independently. */
export type PartSaleSnapshot = {
  date: string; // YYYY-MM-DD
  branch: string;
  uploadedAt: string; // ISO timestamp
  sourceFileName: string;
  counts: PartSaleCounts;
};

export async function savePartSaleSnapshot(snapshot: PartSaleSnapshot): Promise<void> {
  await pool.query(
    `insert into part_sale_snapshots
       (date, branch, uploaded_at, source_file_name, engine_flush, injector_cleaner, synthetic_oil_ltrs, brake_cleaning_spray, external_sales, diy_count, diy_revenue)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     on conflict (date, branch) do update set
       uploaded_at = excluded.uploaded_at,
       source_file_name = excluded.source_file_name,
       engine_flush = excluded.engine_flush,
       injector_cleaner = excluded.injector_cleaner,
       synthetic_oil_ltrs = excluded.synthetic_oil_ltrs,
       brake_cleaning_spray = excluded.brake_cleaning_spray,
       external_sales = excluded.external_sales,
       diy_count = excluded.diy_count,
       diy_revenue = excluded.diy_revenue`,
    [
      snapshot.date,
      snapshot.branch,
      snapshot.uploadedAt,
      snapshot.sourceFileName,
      snapshot.counts.engineFlush,
      snapshot.counts.injectorCleaner,
      snapshot.counts.syntheticOilLtrs,
      snapshot.counts.brakeCleaningSpray,
      snapshot.counts.externalSales,
      snapshot.counts.diyCount,
      snapshot.counts.diyRevenue,
    ]
  );
}

export async function loadPartSaleSnapshot(date: string, branch: string): Promise<PartSaleSnapshot | null> {
  const { rows } = await pool.query(
    `select uploaded_at, source_file_name, engine_flush, injector_cleaner, synthetic_oil_ltrs, brake_cleaning_spray, external_sales, diy_count, diy_revenue
     from part_sale_snapshots where date = $1 and branch = $2`,
    [date, branch]
  );
  const r = rows[0];
  if (!r) return null;

  return {
    date,
    branch,
    uploadedAt: (r.uploaded_at as Date).toISOString(),
    sourceFileName: r.source_file_name,
    counts: {
      engineFlush: Number(r.engine_flush),
      injectorCleaner: Number(r.injector_cleaner),
      syntheticOilLtrs: Number(r.synthetic_oil_ltrs),
      brakeCleaningSpray: Number(r.brake_cleaning_spray),
      externalSales: Number(r.external_sales),
      diyCount: Number(r.diy_count),
      diyRevenue: Number(r.diy_revenue),
    },
  };
}

/** All of one branch's snapshots in the same calendar month as `date`, up to and including it — used for MTD accumulation. */
export async function loadPartSaleSnapshotsForMonthUpTo(date: string, branch: string): Promise<PartSaleSnapshot[]> {
  const monthPrefix = date.slice(0, 7); // YYYY-MM
  const { rows } = await pool.query<{ date: string }>(
    `select distinct date::text as date from part_sale_snapshots
     where branch = $1 and date::text like $2 and date <= $3
     order by date`,
    [branch, `${monthPrefix}%`, date]
  );
  const snapshots = await Promise.all(rows.map((r) => loadPartSaleSnapshot(r.date, branch)));
  return snapshots.filter((s): s is PartSaleSnapshot => s !== null);
}

function rowToSnapshot(r: Record<string, unknown>): PartSaleSnapshot {
  return {
    date: r.date as string,
    branch: r.branch as string,
    uploadedAt: (r.uploaded_at as Date).toISOString(),
    sourceFileName: r.source_file_name as string,
    counts: {
      engineFlush: Number(r.engine_flush),
      injectorCleaner: Number(r.injector_cleaner),
      syntheticOilLtrs: Number(r.synthetic_oil_ltrs),
      brakeCleaningSpray: Number(r.brake_cleaning_spray),
      externalSales: Number(r.external_sales),
      diyCount: Number(r.diy_count),
      diyRevenue: Number(r.diy_revenue),
    },
  };
}

/** All branches' snapshots for exactly one date — one query instead of one per branch, used when building the full dashboard report. */
export async function loadAllPartSaleSnapshotsForDate(date: string): Promise<PartSaleSnapshot[]> {
  const { rows } = await pool.query(
    `select date::text as date, branch, uploaded_at, source_file_name, engine_flush, injector_cleaner, synthetic_oil_ltrs, brake_cleaning_spray, external_sales, diy_count, diy_revenue
     from part_sale_snapshots where date = $1`,
    [date]
  );
  return rows.map(rowToSnapshot);
}

/** All branches' snapshots in the same calendar month as `date`, up to and including it — one query instead of one per branch. */
export async function loadAllPartSaleSnapshotsForMonthUpTo(date: string): Promise<PartSaleSnapshot[]> {
  const monthPrefix = date.slice(0, 7);
  const { rows } = await pool.query(
    `select date::text as date, branch, uploaded_at, source_file_name, engine_flush, injector_cleaner, synthetic_oil_ltrs, brake_cleaning_spray, external_sales, diy_count, diy_revenue
     from part_sale_snapshots where date::text like $1 and date <= $2`,
    [`${monthPrefix}%`, date]
  );
  return rows.map(rowToSnapshot);
}
