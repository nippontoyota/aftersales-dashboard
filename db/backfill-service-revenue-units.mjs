// One-time backfill: "Service Revenue" and "Service Units" are raw BA Tool
// columns that went unmapped (and so silently dropped from every parsed
// snapshot, though the raw file itself was archived in raw_upload_rows)
// until 2026-09-19 — added right after service_gentan_i, once it turned out
// the company/region-level Service Gentan I hero figure needs to be
// Service Revenue ÷ Service Units computed from these two sums, not an
// average of each branch's own already-divided Service Gentan I.
//
// Same approach as db/backfill-service-gentan-i.mjs: every date/branch that
// has raw rows on file gets recomputed from there; earlier dates (before
// raw_upload_rows started keeping ba_tool rows) are left untouched.
//
// Dry-run by default; pass --commit to write.
import { Client } from "pg";
import "../scripts/load-env.mjs";

const COMMIT = process.argv.includes("--commit");
const COLUMNS = { serviceRevenue: "Service Revenue", serviceUnits: "Service Units" };

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
    `select date::text as date, branch, row_data->>'Service Revenue' as revenue, row_data->>'Service Units' as units
       from raw_upload_rows where report_type = 'ba_tool'`
  );

  const recomputed = new Map(); // "date|branch" -> { revenue, units }
  for (const r of raw) {
    recomputed.set(`${r.date}|${r.branch}`, {
      revenue: toNumberOrRaw(r.revenue),
      units: toNumberOrRaw(r.units),
    });
  }

  const { rows: snaps } = await client.query(
    `select date::text as date, branch, service_revenue, service_units from ba_tool_snapshots order by date, branch`
  );

  let changed = 0;
  let skippedNoRaw = 0;
  for (const s of snaps) {
    const key = `${s.date}|${s.branch}`;
    const next = recomputed.get(key);
    if (!next) {
      skippedNoRaw++;
      continue;
    }
    const curRevenue = s.service_revenue === null ? null : Number(s.service_revenue);
    const curUnits = s.service_units === null ? null : Number(s.service_units);
    const sameRevenue = curRevenue === next.revenue || (curRevenue !== null && next.revenue !== null && Math.abs(curRevenue - next.revenue) < 0.005);
    const sameUnits = curUnits === next.units || (curUnits !== null && next.units !== null && Math.abs(curUnits - next.units) < 0.005);
    if (sameRevenue && sameUnits) continue;
    changed++;
    console.log(
      `${s.date} ${s.branch}  revenue ${curRevenue ?? "null"} -> ${next.revenue ?? "null"}   units ${curUnits ?? "null"} -> ${next.units ?? "null"}`
    );
    if (COMMIT) {
      await client.query(`update ba_tool_snapshots set service_revenue = $1, service_units = $2 where date = $3 and branch = $4`, [
        next.revenue,
        next.units,
        s.date,
        s.branch,
      ]);
    }
  }

  console.log(
    `\n${changed} snapshot row(s) ${COMMIT ? "updated" : "would change"}; ` +
      `${skippedNoRaw} left untouched (no raw rows on file for that date/branch).`
  );
  if (!COMMIT) console.log("Dry run — re-run with --commit to apply.");
} finally {
  await client.end();
}
