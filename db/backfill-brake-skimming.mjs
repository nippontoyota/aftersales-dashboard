// One-time backfill (2026-09-07): recompute service_info_snapshots.brake_skimming
// as distinct repair orders with a brake-skimming line, not the line count.
// Both front discs of one car are two rows ("- GRIND" + "- COMB: OPP-GRIND")
// on the same Job Order No, so the old per-row count ran ~40% high.
//
// Only snapshots that have the matching raw rows on file are recomputed;
// snapshots without them (pre-raw-rows, or partial uploads) are left as-is.
//
// Dry-run by default; pass --commit to write.
//
// Match strings kept in sync with src/lib/service-info/parse.ts BRAKE_SKIMMING_DESCS.
import { Client } from "pg";
import "../scripts/load-env.mjs";

const COMMIT = process.argv.includes("--commit");

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const GRIND = `regexp_replace(row_data->>'Job Desc', '\\s+', ' ', 'g') = any(array[
    'FR DISC (ONE SIDE) (ON-VEHICLE) - GRIND',
    'FR DISC (ONE SIDE) (ON-VEHICLE) - COMB: OPP-GRIND'])`;

  const { rows: recomputed } = await client.query(`
    select date::text as date, branch,
           count(distinct coalesce(nullif(trim(row_data->>'Job Order No'), ''), 'row:' || id::text)) as n
    from raw_upload_rows
    where report_type = 'service_info' and ${GRIND}
    group by 1, 2`);
  const want = new Map(recomputed.map((r) => [`${r.branch}|${r.date}`, Number(r.n)]));

  const { rows: snaps } = await client.query(
    `select date::text as date, branch, brake_skimming from service_info_snapshots order by date, branch`
  );

  let changed = 0;
  let skippedNoRaw = 0;
  for (const s of snaps) {
    const key = `${s.branch}|${s.date}`;
    if (!want.has(key)) {
      if (Number(s.brake_skimming) > 0) skippedNoRaw++;
      continue;
    }
    const next = want.get(key);
    const cur = Number(s.brake_skimming);
    if (next === cur) continue;
    changed++;
    console.log(`${s.date} ${s.branch}  ${cur} -> ${next}`);
    if (COMMIT) {
      await client.query(`update service_info_snapshots set brake_skimming = $1 where date = $2 and branch = $3`, [
        next,
        s.date,
        s.branch,
      ]);
    }
  }

  console.log(
    `\n${changed} snapshot row(s) ${COMMIT ? "updated" : "would change"}; ` +
      `${skippedNoRaw} left untouched (brake_skimming > 0 but no matching raw rows on file).`
  );
  if (!COMMIT) console.log("Dry run — re-run with --commit to apply.");
} finally {
  await client.end();
}
