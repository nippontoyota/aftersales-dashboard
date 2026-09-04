import { pool } from "./db";
import { BA_TOOL_COLUMNS, type BaToolKey } from "./ba-tool/columns";
import type { BaToolBranchRow } from "./ba-tool/parse";

/**
 * BA Tool snapshots — Postgres-backed (see db/schema.sql, ba_tool_snapshots:
 * one row per branch per date). Each upload atomically replaces every row
 * for that date (delete + insert in one transaction) so a re-upload with a
 * different branch set never leaves stale branches behind — same
 * full-replace semantics the old one-JSON-file-per-date version had.
 */
export type Snapshot = {
  date: string; // YYYY-MM-DD
  uploadedAt: string; // ISO timestamp
  sourceFileName: string;
  branches: BaToolBranchRow[];
};

const NUMERIC_KEYS = (Object.keys(BA_TOOL_COLUMNS) as BaToolKey[]).filter((k) => k !== "branch");

/** camelCase BaToolKey -> snake_case column name in ba_tool_snapshots. */
const COLUMN_NAME: Record<Exclude<BaToolKey, "branch">, string> = {
  pm: "pm",
  pmTarget: "pm_target",
  bpus: "bpus",
  bpusTarget: "bpus_target",
  sprInternal: "spr_internal",
  sprInternalTarget: "spr_internal_target",
  sprExternal: "spr_external",
  spoDealer: "spo_dealer",
  spoDealerTarget: "spo_dealer_target",
  spoTGloss: "spo_tgloss",
  spoTGlossTarget: "spo_tgloss_target",
  cpus: "cpus",
  gus: "gus",
  tyreActual: "tyre_actual",
  tyreTarget: "tyre_target",
  batteryActuals: "battery_actuals",
  batteryTarget: "battery_target",
  servicePenetration: "service_penetration",
};

export async function saveSnapshot(snapshot: Snapshot): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("delete from ba_tool_snapshots where date = $1", [snapshot.date]);

    for (const row of snapshot.branches) {
      const columns = ["date", "branch", "uploaded_at", "source_file_name", ...NUMERIC_KEYS.map((k) => COLUMN_NAME[k])];
      const values: unknown[] = [
        snapshot.date,
        row.branch,
        snapshot.uploadedAt,
        snapshot.sourceFileName,
        ...NUMERIC_KEYS.map((k) => (typeof row[k] === "number" ? row[k] : null)),
      ];
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
      await client.query(`insert into ba_tool_snapshots (${columns.join(", ")}) values (${placeholders})`, values);
    }

    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export async function loadSnapshot(date: string): Promise<Snapshot | null> {
  const columns = ["branch", "uploaded_at", "source_file_name", ...NUMERIC_KEYS.map((k) => COLUMN_NAME[k])];
  const { rows } = await pool.query(
    `select ${columns.join(", ")} from ba_tool_snapshots where date = $1 order by branch`,
    [date]
  );
  if (rows.length === 0) return null;

  const branches: BaToolBranchRow[] = rows.map((r) => {
    const entry: BaToolBranchRow = { branch: r.branch };
    for (const key of NUMERIC_KEYS) {
      const raw = r[COLUMN_NAME[key]];
      entry[key] = raw === null ? null : Number(raw);
    }
    return entry;
  });

  return {
    date,
    uploadedAt: (rows[0].uploaded_at as Date).toISOString(),
    sourceFileName: rows[0].source_file_name,
    branches,
  };
}

/** All available snapshot dates, ascending (YYYY-MM-DD). */
export async function listSnapshotDates(): Promise<string[]> {
  const { rows } = await pool.query<{ date: string }>("select distinct date::text as date from ba_tool_snapshots order by date");
  return rows.map((r) => r.date);
}

/** The most recent snapshot strictly before the given date *in the same calendar month*, if any. This prevents MTD subtraction from crossing month boundaries and producing massive negative numbers on the 1st. */
export async function loadPreviousSnapshot(date: string): Promise<Snapshot | null> {
  const monthPrefix = date.slice(0, 7);
  const dates = await listSnapshotDates();
  const priorDates = dates.filter((d) => d < date && d.startsWith(monthPrefix)).sort();
  const previousDate = priorDates.at(-1);
  if (!previousDate) return null;
  return loadSnapshot(previousDate);
}

/** The most recent row for one branch in the same calendar month as `date`
 * but strictly before it. Used to give the online-store code — which only
 * appears in the BA Tool on days it transacts — a correct previous-day
 * baseline for "for the day" deltas, instead of treating its whole standing
 * MTD balance as a single day's movement the first time it reappears after a
 * gap. Null if that branch never appeared earlier this month. */
export async function loadLatestBranchRowInMonthBefore(
  date: string,
  branch: string
): Promise<BaToolBranchRow | null> {
  const columns = NUMERIC_KEYS.map((k) => COLUMN_NAME[k]);
  const { rows } = await pool.query(
    `select ${columns.join(", ")} from ba_tool_snapshots
      where branch = $1 and date < $2::date and date >= date_trunc('month', $2::date)
      order by date desc limit 1`,
    [branch, date]
  );
  if (rows.length === 0) return null;

  const entry: BaToolBranchRow = { branch };
  for (const key of NUMERIC_KEYS) {
    const raw = rows[0][COLUMN_NAME[key]];
    entry[key] = raw === null ? null : Number(raw);
  }
  return entry;
}

/** All snapshots in the same calendar month as `date`, up to and including it — used for MTD accumulation of non-cumulative columns (Tyre/Battery). */
export async function loadSnapshotsForMonthUpTo(date: string): Promise<Snapshot[]> {
  const monthPrefix = date.slice(0, 7); // YYYY-MM
  const dates = await listSnapshotDates();
  const inRange = dates.filter((d) => d.startsWith(monthPrefix) && d <= date);
  const snapshots = await Promise.all(inRange.map(loadSnapshot));
  return snapshots.filter((s): s is Snapshot => s !== null);
}
