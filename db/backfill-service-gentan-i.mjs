// One-time backfill: "Service Gentan I" was a real BA Tool column that went
// unmapped in src/lib/ba-tool/columns.ts (and so silently dropped from
// every parsed snapshot) until 2026-09-19, when it was added for the TKM
// Targets hero card. The raw BA Tool file was archived in raw_upload_rows
// for every upload regardless, so every date that has raw rows on file can
// be backfilled from there — only pre-raw-archive dates (before
// raw_upload_rows started keeping ba_tool rows) are left untouched.
//
// Mirrors toNumberOrRaw in src/lib/ba-tool/parse.ts (comma-thousands and
// trailing "%" handling) since this reads the same raw string values that
// function would have parsed at upload time.
//
// Dry-run by default; pass --commit to write.
import { Client } from "pg";
import "../scripts/load-env.mjs";

const COMMIT = process.argv.includes("--commit");
const COLUMN = "Service Gentan I";

const THOUSANDS_SEPARATED = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/;

function toNumberOrRaw(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  const str = String(value).trim();
  if (str.endsWith("%")) {
    const n = Number(str.slice(0, -1));
    return Number.isFinite(n) ? n / 100 : null;
  }
  if (THOUSANDS_SEPARATED.test(str)) {
    const n = Number(str.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(str);
  return Number.isFinite(n) ? n : null;
}

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows: raw } = await client.query(
    `select date::text as date, branch, row_data->>$1 as value
       from raw_upload_rows where report_type = 'ba_tool'`,
    [COLUMN]
  );

  const recomputed = new Map(); // "date|branch" -> number | null
  let rawColumnMissing = 0;
  for (const r of raw) {
    const parsed = toNumberOrRaw(r.value);
    if (r.value === null) rawColumnMissing++;
    recomputed.set(`${r.date}|${r.branch}`, parsed);
  }

  const { rows: snaps } = await client.query(
    `select date::text as date, branch, service_gentan_i from ba_tool_snapshots order by date, branch`
  );

  let changed = 0;
  let skippedNoRaw = 0;
  for (const s of snaps) {
    const key = `${s.date}|${s.branch}`;
    if (!recomputed.has(key)) {
      skippedNoRaw++;
      continue;
    }
    const cur = s.service_gentan_i === null ? null : Number(s.service_gentan_i);
    const next = recomputed.get(key);
    if (cur === next || (cur !== null && next !== null && Math.abs(cur - next) < 0.005)) continue;
    changed++;
    console.log(`${s.date} ${s.branch}  ${cur ?? "null"}  ->  ${next ?? "null"}`);
    if (COMMIT) {
      await client.query(`update ba_tool_snapshots set service_gentan_i = $1 where date = $2 and branch = $3`, [next, s.date, s.branch]);
    }
  }

  console.log(
    `\n${changed} snapshot row(s) ${COMMIT ? "updated" : "would change"}; ` +
      `${skippedNoRaw} left untouched (no raw rows on file for that date/branch).`
  );
  if (rawColumnMissing > 0) {
    console.log(`Note: ${rawColumnMissing} raw row(s) on file didn't have a "${COLUMN}" value at all (blank cell or file predates the column).`);
  }
  if (!COMMIT) console.log("Dry run — re-run with --commit to apply.");
} finally {
  await client.end();
}
