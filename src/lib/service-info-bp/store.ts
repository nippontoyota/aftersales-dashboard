import { pool } from "../db";

/** service_info_bp_snapshots — one row per branch per date (see
 * db/schema.sql). Parsed with the exact same rules as the GS report
 * (service-info/parse.ts), but only 4 of its 5 metrics: Wheel Balancing,
 * Wheel Alignment, Brake Skimming, VAS Revenue — Evaporator Cleaning is
 * deliberately not tracked here (2026-09-11, at the user's request: GS+BP
 * for the other four, Evaporator Cleaning stays GS-only). Kept as its own
 * table rather than a column on service_info_snapshots so a day with only
 * a BP upload (no GS one — e.g. a Body & Paint-only branch, or GS just
 * running late) still has somewhere to live; the two are only ever added
 * together at read time, in service-info/store.ts's
 * loadCombinedServiceInfoSnapshots* functions. */
export type ServiceInfoBpCounts = {
  wheelBalancing: number;
  wheelAlignment: number;
  brakeSkimming: number;
  vasRevenue: number;
};

export type ServiceInfoBpSnapshot = {
  date: string; // YYYY-MM-DD
  branch: string;
  uploadedAt: string; // ISO timestamp
  sourceFileName: string;
  counts: ServiceInfoBpCounts;
};

/** Takes the full ServiceInfoCounts the parser returns (it doesn't know or
 * care whether it parsed a GS or BP file) and keeps only the 4 fields this
 * table tracks — dropping evaporatorCleaning here, structurally, rather
 * than trusting every caller to remember not to use it. */
export async function saveServiceInfoBpSnapshot(snapshot: {
  date: string;
  branch: string;
  uploadedAt: string;
  sourceFileName: string;
  counts: ServiceInfoBpCounts;
}): Promise<void> {
  await pool.query(
    `insert into service_info_bp_snapshots
       (date, branch, uploaded_at, source_file_name, wheel_balancing, wheel_alignment, brake_skimming, vas_revenue)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (date, branch) do update set
       uploaded_at = excluded.uploaded_at,
       source_file_name = excluded.source_file_name,
       wheel_balancing = excluded.wheel_balancing,
       wheel_alignment = excluded.wheel_alignment,
       brake_skimming = excluded.brake_skimming,
       vas_revenue = excluded.vas_revenue`,
    [
      snapshot.date,
      snapshot.branch,
      snapshot.uploadedAt,
      snapshot.sourceFileName,
      snapshot.counts.wheelBalancing,
      snapshot.counts.wheelAlignment,
      snapshot.counts.brakeSkimming,
      snapshot.counts.vasRevenue,
    ]
  );
}

function rowToSnapshot(r: Record<string, unknown>): ServiceInfoBpSnapshot {
  return {
    date: r.date as string,
    branch: r.branch as string,
    uploadedAt: (r.uploaded_at as Date).toISOString(),
    sourceFileName: r.source_file_name as string,
    counts: {
      wheelBalancing: Number(r.wheel_balancing),
      wheelAlignment: Number(r.wheel_alignment),
      brakeSkimming: Number(r.brake_skimming),
      vasRevenue: Number(r.vas_revenue),
    },
  };
}

const SELECT_COLUMNS = "date::text as date, branch, uploaded_at, source_file_name, wheel_balancing, wheel_alignment, brake_skimming, vas_revenue";

export async function loadServiceInfoBpSnapshot(date: string, branch: string): Promise<ServiceInfoBpSnapshot | null> {
  const { rows } = await pool.query(`select ${SELECT_COLUMNS} from service_info_bp_snapshots where date = $1 and branch = $2`, [date, branch]);
  const r = rows[0];
  return r ? rowToSnapshot(r) : null;
}

/** All of one branch's BP snapshots in the same calendar month as `date`, up to and including it. */
export async function loadServiceInfoBpSnapshotsForMonthUpTo(date: string, branch: string): Promise<ServiceInfoBpSnapshot[]> {
  const monthPrefix = date.slice(0, 7);
  const { rows } = await pool.query(
    `select ${SELECT_COLUMNS} from service_info_bp_snapshots
     where branch = $1 and date::text like $2 and date <= $3
     order by date`,
    [branch, `${monthPrefix}%`, date]
  );
  return rows.map(rowToSnapshot);
}

/** All branches' BP snapshots for exactly one date. */
export async function loadAllServiceInfoBpSnapshotsForDate(date: string): Promise<ServiceInfoBpSnapshot[]> {
  const { rows } = await pool.query(`select ${SELECT_COLUMNS} from service_info_bp_snapshots where date = $1`, [date]);
  return rows.map(rowToSnapshot);
}

/** All branches' BP snapshots in the same calendar month as `date`, up to and including it. */
export async function loadAllServiceInfoBpSnapshotsForMonthUpTo(date: string): Promise<ServiceInfoBpSnapshot[]> {
  const monthPrefix = date.slice(0, 7);
  const { rows } = await pool.query(`select ${SELECT_COLUMNS} from service_info_bp_snapshots where date::text like $1 and date <= $2`, [
    `${monthPrefix}%`,
    date,
  ]);
  return rows.map(rowToSnapshot);
}
