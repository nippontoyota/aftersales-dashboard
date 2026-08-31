import { pool } from "../db";
import type { ServiceInfoCounts } from "./parse";

/** service_info_snapshots — one row per branch per date (see db/schema.sql). Upsert on (date, branch) since each branch uploads independently. */
export type ServiceInfoSnapshot = {
  date: string; // YYYY-MM-DD
  branch: string;
  uploadedAt: string; // ISO timestamp
  sourceFileName: string;
  counts: ServiceInfoCounts;
};

export async function saveServiceInfoSnapshot(snapshot: ServiceInfoSnapshot): Promise<void> {
  await pool.query(
    `insert into service_info_snapshots
       (date, branch, uploaded_at, source_file_name, wheel_balancing, wheel_alignment, brake_skimming, evaporator_cleaning, vas_revenue)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (date, branch) do update set
       uploaded_at = excluded.uploaded_at,
       source_file_name = excluded.source_file_name,
       wheel_balancing = excluded.wheel_balancing,
       wheel_alignment = excluded.wheel_alignment,
       brake_skimming = excluded.brake_skimming,
       evaporator_cleaning = excluded.evaporator_cleaning,
       vas_revenue = excluded.vas_revenue`,
    [
      snapshot.date,
      snapshot.branch,
      snapshot.uploadedAt,
      snapshot.sourceFileName,
      snapshot.counts.wheelBalancing,
      snapshot.counts.wheelAlignment,
      snapshot.counts.brakeSkimming,
      snapshot.counts.evaporatorCleaning,
      snapshot.counts.vasRevenue,
    ]
  );
}

function rowToSnapshot(r: Record<string, unknown>): ServiceInfoSnapshot {
  return {
    date: r.date as string,
    branch: r.branch as string,
    uploadedAt: (r.uploaded_at as Date).toISOString(),
    sourceFileName: r.source_file_name as string,
    counts: {
      wheelBalancing: Number(r.wheel_balancing),
      wheelAlignment: Number(r.wheel_alignment),
      brakeSkimming: Number(r.brake_skimming),
      evaporatorCleaning: Number(r.evaporator_cleaning),
      vasRevenue: Number(r.vas_revenue),
    },
  };
}

const SELECT_COLUMNS =
  "date::text as date, branch, uploaded_at, source_file_name, wheel_balancing, wheel_alignment, brake_skimming, evaporator_cleaning, vas_revenue";

export async function loadServiceInfoSnapshot(date: string, branch: string): Promise<ServiceInfoSnapshot | null> {
  const { rows } = await pool.query(`select ${SELECT_COLUMNS} from service_info_snapshots where date = $1 and branch = $2`, [date, branch]);
  const r = rows[0];
  return r ? rowToSnapshot(r) : null;
}

/** All of one branch's snapshots in the same calendar month as `date`, up to and including it — used for MTD accumulation. */
export async function loadServiceInfoSnapshotsForMonthUpTo(date: string, branch: string): Promise<ServiceInfoSnapshot[]> {
  const monthPrefix = date.slice(0, 7); // YYYY-MM
  const { rows } = await pool.query(
    `select ${SELECT_COLUMNS} from service_info_snapshots
     where branch = $1 and date::text like $2 and date <= $3
     order by date`,
    [branch, `${monthPrefix}%`, date]
  );
  return rows.map(rowToSnapshot);
}

/** All branches' snapshots for exactly one date — one query instead of one per branch, used when building the full dashboard report. */
export async function loadAllServiceInfoSnapshotsForDate(date: string): Promise<ServiceInfoSnapshot[]> {
  const { rows } = await pool.query(`select ${SELECT_COLUMNS} from service_info_snapshots where date = $1`, [date]);
  return rows.map(rowToSnapshot);
}

/** All branches' snapshots in the same calendar month as `date`, up to and including it — one query instead of one per branch. */
export async function loadAllServiceInfoSnapshotsForMonthUpTo(date: string): Promise<ServiceInfoSnapshot[]> {
  const monthPrefix = date.slice(0, 7);
  const { rows } = await pool.query(`select ${SELECT_COLUMNS} from service_info_snapshots where date::text like $1 and date <= $2`, [
    `${monthPrefix}%`,
    date,
  ]);
  return rows.map(rowToSnapshot);
}
