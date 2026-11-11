import "./load-env.mjs";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { Pool } from "pg";

/** Imports a standardized "new conquest vehicles" CSV (2026-11-11, at the
 * user's request) — one row per Toyota/Lexus vehicle found in an external
 * RTO registration extract that matched neither ce_leads, our Service Info/
 * SSRV089 history, nor any N-9 list. This script only knows how to load the
 * ALREADY-matched, ALREADY-deduplicated standardized shape (columns:
 * source, regno_norm, vin_norm, owner_name, owner_mobile, model, maker,
 * reg_date, address) — the messy part (several different raw file layouts,
 * Toyota-detection, VIN/regno matching against our own data, cross-file
 * dedup) is a one-off analysis pass, not a reusable pipeline; redo that
 * analysis for any future registration-list batch and feed its output
 * through this same script. Idempotent via the unique registration_no
 * index — rerunning on a file that includes already-imported rows is safe.
 *
 * Usage: node scripts/import-conquest-leads.mjs <standardized-csv> [--apply]
 */

function normalizeIndianMobile(value) {
  let digits = String(value ?? "").replace(/^#/, "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

const text = (value) => {
  const t = String(value ?? "").trim();
  return t === "" ? null : t;
};

// The source Excel files mix date-formatted cells (pandas renders these as
// "YYYY-MM-DD HH:MM:SS" text once round-tripped through the analysis CSV)
// and plain-number cells holding a raw Excel date serial (e.g. "45047") —
// same ambiguity src/lib/ce/parse.ts's dateOnly() already handles for other
// imports, resolved the same way here.
function normalizeRegistrationDate(value) {
  const raw = text(value);
  if (!raw) return null;
  if (/^\d+(\.0+)?$/.test(raw)) {
    const parsed = XLSX.SSF.parse_date_code(Number(raw));
    if (!parsed) return null;
    return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  return match ? match[0].slice(0, 10) : null;
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const positional = args.filter((arg) => arg !== "--apply");
if (positional.length !== 1 || args.some((arg) => arg.startsWith("--") && arg !== "--apply")) {
  throw new Error("Usage: node scripts/import-conquest-leads.mjs <standardized-csv> [--apply]");
}

const sourcePath = positional[0];
const buffer = readFileSync(sourcePath);
const workbook = XLSX.read(buffer, { type: "buffer" });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });

const records = rawRows
  .map((row) => ({
    registration_no: text(row.regno_norm),
    vin: text(row.vin_norm),
    owner_name: text(row.owner_name),
    owner_mobile: normalizeIndianMobile(row.owner_mobile),
    vehicle_model: text(row.model),
    vehicle_maker: text(row.maker),
    registration_date: normalizeRegistrationDate(row.reg_date),
    address: text(row.address),
    source_file: text(row.source) ?? "unknown",
  }))
  .filter((r) => r.registration_no);

// The same physical vehicle can show up twice under one registration_no —
// once (with a VIN) from a chassis-number-bearing source file, once (no
// VIN) from a source that never had one — since the standardized CSV's
// cross-file dedup groups by VIN-or-regno "identity", which treats those as
// different identities and keeps both. The DB's unique registration_no
// index collapses them at insert time regardless (on conflict do nothing),
// but whichever row lands first wins — sort VIN-bearing rows first so a
// VIN we actually have is never silently dropped in favor of a VIN-less
// duplicate of the same car.
records.sort((a, b) => (b.vin !== null) - (a.vin !== null));

if (records.length === 0) throw new Error("No rows with a registration number found in this file.");
console.log(`Parsed ${records.length} candidate conquest leads from ${sourcePath}`);

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true, ca: process.env.DATABASE_CA_CERT } });
const client = await pool.connect();
try {
  await client.query("begin");
  await client.query("select pg_advisory_xact_lock(20261111)");

  const { rows: beforeRows } = await client.query("select count(*)::int c from ce_conquest_leads");

  await client.query(`
    create temp table conquest_stage (
      registration_no text, vin text, owner_name text, owner_mobile text,
      vehicle_model text, vehicle_maker text, registration_date text, address text, source_file text
    ) on commit drop
  `);

  const chunkSize = 2_000;
  for (let start = 0; start < records.length; start += chunkSize) {
    const batch = records.slice(start, start + chunkSize);
    await client.query(
      `insert into conquest_stage
       select * from jsonb_to_recordset($1::jsonb) as r(
         registration_no text, vin text, owner_name text, owner_mobile text,
         vehicle_model text, vehicle_maker text, registration_date text, address text, source_file text
       )`,
      [JSON.stringify(batch)],
    );
  }

  const staged = await client.query("select count(*)::int count from conquest_stage");
  if (staged.rows[0].count !== records.length) throw new Error(`Staged row count mismatch: expected ${records.length}, got ${staged.rows[0].count}.`);

  const inserted = await client.query(`
    with ins as (
      insert into ce_conquest_leads (registration_no, vin, owner_name, owner_mobile, vehicle_model, vehicle_maker, registration_date, address, source_file)
      select registration_no, vin, owner_name, owner_mobile, vehicle_model, vehicle_maker,
             nullif(registration_date, '')::date, address, source_file
      from conquest_stage
      on conflict (registration_no) do nothing
      returning id
    )
    insert into ce_conquest_workflow (conquest_lead_id)
    select id from ins
    returning conquest_lead_id
  `);

  if (apply) await client.query("commit");
  else await client.query("rollback");

  console.log({
    apply,
    stagedRows: records.length,
    totalBeforeThisImport: beforeRows[0].c,
    newlyInserted: inserted.rowCount,
    alreadyPresent: records.length - inserted.rowCount,
  });
  if (!apply) console.log("Dry run only — nothing committed. Re-run with --apply after reviewing these aggregates.");
} catch (error) {
  await client.query("rollback").catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}
