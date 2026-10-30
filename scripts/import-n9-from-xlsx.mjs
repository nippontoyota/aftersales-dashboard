import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import * as XLSX from "xlsx";
import "./load-env.mjs";
import { normalizeCeVin, normalizeIndianMobile } from "../src/lib/ce/n9.mjs";
import { applyN9Batch } from "./n9-apply.mjs";

// One-off backfill: TKM's daily N-9 export is normally one file per day
// (see import-n9-list.mjs), but a consolidated workbook can arrive with
// several days' extracts concatenated into one sheet, distinguished only
// by "DM Data Extract Date" varying row to row. This splits that sheet
// back into per-day batches and runs each through the same n9-apply.mjs
// logic the daily importer uses — never duplicate that staging SQL.
//
// Its dates are Excel-formatted M/D/YY (e.g. "10/1/26"), not the daily
// export's literal YYYY/MM/DD text — a different format from
// src/lib/ce/n9.mjs's parser, which is why this has its own date parsing
// rather than reusing parseN9List() directly.

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const positional = args.filter((arg) => arg !== "--apply");
if (positional.length < 1 || positional.length > 2 || args.some((arg) => arg.startsWith("--") && arg !== "--apply")) {
  throw new Error("Usage: node scripts/import-n9-from-xlsx.mjs <workbook.xlsx> [sheetName] [--apply]");
}

const sourcePath = path.resolve(positional[0]);
const buffer = readFileSync(sourcePath);
const workbook = XLSX.read(buffer, { type: "buffer" });
const sheetName = positional[1] ?? workbook.SheetNames.find((name) => /^\d{8}_/.test(name));
if (!sheetName || !workbook.Sheets[sheetName]) {
  throw new Error(`Sheet not found. Available sheets: ${workbook.SheetNames.join(", ")}`);
}
const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
const header = rows[0];
const data = rows.slice(1);

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

const text = (value) => String(value ?? "").trim();
const col = (name) => {
  const idx = header.indexOf(name);
  if (idx === -1) throw new Error(`Column "${name}" not found in sheet "${sheetName}".`);
  return idx;
};
const at = (row, name) => row[col(name)];

/** Excel's own "M/D/YY" rendering (sheet_to_json with raw:false formats
 * dates this way) — distinct from n9.mjs's "YYYY/MM/DD" literal-text
 * format. Two-digit years are assumed 20xx — every date in this dataset
 * is 2025/2026. */
function dateOnly(value) {
  const raw = text(value);
  if (raw === "" || raw.toUpperCase() === "N/A") return null;
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = 2000 + Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const byDate = new Map();
let skipped = 0;
for (let i = 0; i < data.length; i++) {
  const source = data[i];
  if (source.every((value) => text(value) === "")) continue;
  const rowNumber = i + 2;

  const vin = normalizeCeVin(at(source, "VIN"));
  const extractDate = dateOnly(at(source, "DM Data Extract Date"));
  const dmPlannedDate = dateOnly(at(source, "DM Planned Date"));
  const firstCallPlannedDate = dateOnly(at(source, "1st CALL Planned Date"));
  if (!vin || !extractDate || !dmPlannedDate || !firstCallPlannedDate) {
    skipped++;
    continue;
  }
  if (extractDate > today) {
    skipped++;
    continue;
  }

  const row = {
    vin,
    extractDate,
    customerName: text(at(source, "Customer Name")),
    mobileNumber: normalizeIndianMobile(at(source, "Mobile No.")),
    registrationNo: text(at(source, "Rego#")),
    vehicleModel: text(at(source, "Vehicle Name")),
    vehicleSalesType: text(at(source, "Vehicle Sales Type")),
    dmPlannedDate,
    firstCallPlannedDate,
    icropRecommendedName: text(at(source, "i-CROP Next Recommended Name")) || null,
    icropRecommendedDate: dateOnly(at(source, "i-CROP Next Recommended Date")),
    activityCategory: text(at(source, "Activity Category")) || null,
    activityCat2Reason: text(at(source, "Activity Cat2 Reason")) || null,
  };

  const group = byDate.get(extractDate) ?? new Map();
  group.set(vin, { row, worksheetRow: rowNumber }); // latest row per VIN wins within a day, same rule as n9.mjs
  byDate.set(extractDate, group);
}

const dates = [...byDate.keys()].sort();
console.log(`Found ${dates.length} distinct extract date(s) across ${data.length} rows (${skipped} skipped: missing VIN/date or future-dated).`);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  for (const extractDate of dates) {
    const group = byDate.get(extractDate);
    const dayRows = [...group.values()].map(({ row }) => row);
    const parsed = {
      rows: dayRows,
      extractDate,
      sourceRowCount: dayRows.length,
      duplicateRows: 0,
    };
    const sha256 = createHash("sha256")
      .update(`${sourcePath}#${sheetName}#${extractDate}#${JSON.stringify(dayRows.map((r) => r.vin).sort())}`)
      .digest("hex");
    const sourceFileName = `${path.basename(sourcePath)}#${sheetName}#${extractDate}`;

    const result = await applyN9Batch({ client, parsed, sourceFileName, sha256, apply });
    if (result.noop) {
      console.log(`${extractDate}: no-op (already audited as import ${result.priorImportId}).`);
    } else {
      console.log(`${extractDate}: ${apply ? "applied" : "dry run"} —`, result);
    }
  }
  if (!apply) console.log("\nNo changes committed. Re-run with --apply after reviewing these aggregates.");
} finally {
  await client.end();
}
