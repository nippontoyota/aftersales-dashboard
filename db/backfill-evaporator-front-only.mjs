// One-time backfill (2026-09-07): recompute service_info_snapshots.evaporator_cleaning
// as front-evaporator only. The parser used to count both
// "TGLOSS Air Fresh-Front Evaporator" and "…-Rear Evaporator"; per the user
// it's front only now (rear, "Front and Rear", AC duct cleaning, odour
// neutralizer and evaporator R&R are all excluded).
//
// Normalizes Job Desc exactly as src/lib/service-info/parse.ts does (JS
// \s collapse + trim, which also folds non-breaking spaces) so the recount
// matches the parser byte-for-byte. Only snapshots with the matching raw
// rows on file are recomputed; the rest are left as-is.
//
// Dry-run by default; pass --commit to write.
import { Client } from "pg";
import "../scripts/load-env.mjs";

const COMMIT = process.argv.includes("--commit");
const TARGET = "TGLOSS Air Fresh-Front Evaporator";
const normalize = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  // small subset — every row whose Job Desc mentions an evaporator
  const { rows } = await client.query(
    `select date::text as date, branch, row_data->>'Job Desc' as jd
     from raw_upload_rows
     where report_type = 'service_info' and row_data->>'Job Desc' ilike '%vaporator%'`
  );

  const want = new Map(); // branch|date -> front-evaporator row count
  for (const r of rows) {
    const key = `${r.branch}|${r.date}`;
    if (!want.has(key)) want.set(key, 0);
    if (normalize(r.jd) === TARGET) want.set(key, want.get(key) + 1);
  }

  const { rows: snaps } = await client.query(
    `select date::text as date, branch, evaporator_cleaning from service_info_snapshots order by date, branch`
  );

  let changed = 0;
  let skippedNoRaw = 0;
  for (const s of snaps) {
    const key = `${s.branch}|${s.date}`;
    if (!want.has(key)) {
      if (Number(s.evaporator_cleaning) > 0) skippedNoRaw++;
      continue;
    }
    const next = want.get(key);
    const cur = Number(s.evaporator_cleaning);
    if (next === cur) continue;
    changed++;
    console.log(`${s.date} ${s.branch}  ${cur} -> ${next}`);
    if (COMMIT) {
      await client.query(`update service_info_snapshots set evaporator_cleaning = $1 where date = $2 and branch = $3`, [
        next,
        s.date,
        s.branch,
      ]);
    }
  }

  console.log(
    `\n${changed} snapshot row(s) ${COMMIT ? "updated" : "would change"}; ` +
      `${skippedNoRaw} left untouched (evaporator_cleaning > 0 but no evaporator raw rows on file).`
  );
  if (!COMMIT) console.log("Dry run — re-run with --commit to apply.");
} finally {
  await client.end();
}
