// CO01A's Service Info-GS upload for 07 Sep and Part Sale upload for 03 Sep
// were each partial exports — short of what the DMS actually recorded for
// those days. The user pulled fresh cumulative 01-11 Sep exports straight
// from the DMS (attached 2026-09-12) and we cross-checked them row-by-row
// (by Invoice Date / SaleDate) against what's on file; see
// docs/data-reconciliation.md. Confirmed gaps:
//
//   Service Info-GS, 07 Sep: on file WB=2/WA=4/BS=1/EC=0/VAS=6,158.98,
//   true day (from the cumulative file) is WB=9/WA=13/BS=1/EC=3/
//   VAS=36,837.44.
//
//   Part Sale, 03 Sep: on file injectorCleaner=10/diyCount=2/diyRevenue=466,
//   true day is injectorCleaner=11/diyCount=4/diyRevenue=932 (engineFlush/
//   syntheticOil/brakeCleaningSpray/externalSales already matched).
//
// This re-derives each day's rows and counts straight from the cumulative
// files (filtered to that one Invoice Date / SaleDate) using the exact same
// parsing rules as src/lib/service-info/parse.ts and
// src/lib/part-sale/parse.ts, replaces that day's raw_upload_rows, and
// updates the snapshot — same effect as if the branch had originally
// uploaded a complete file for that single day.
//
//   node scripts/fix-co01a-sep-partial-uploads.mjs <service-info-gs-csv> <part-sale-csv> [--commit]
import { Client } from "pg";
import * as XLSX from "xlsx";
import fs from "fs";
import "./load-env.mjs";
import { VAS_PRICE_BY_JOB_CODE } from "../src/lib/vas-price-list.ts";
import { seriesToSize } from "../src/lib/vas-series-map.ts";
import { tierForBranch } from "../src/lib/branch-tier.ts";

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");
const positional = args.filter((a) => !a.startsWith("--"));
const [SERVICE_INFO_FILE, PART_SALE_FILE] = positional;

if (!SERVICE_INFO_FILE || !PART_SALE_FILE) {
  console.error("Usage: node scripts/fix-co01a-sep-partial-uploads.mjs <service-info-gs-csv> <part-sale-csv> [--commit]");
  process.exit(1);
}

const BRANCH = "CO01A";
const SERVICE_INFO_DATE = "2026-09-07";
const PART_SALE_DATE = "2026-09-03";
const STAFF_NAMES = ["Aneesh E K", "Prinson Xavier"]; // CO01A's current Accessories roster

const normalize = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const normalizeName = (v) => normalize(v).toLowerCase();
function isAccessoriesStaff(staffNames, closeSaName) {
  const target = normalizeName(closeSaName);
  return staffNames.some((n) => normalizeName(n) === target);
}

// --- date extraction straight from the raw CSV text (not the XLSX-coerced
// cell), because XLSX auto-guesses a date-looking CSV cell as MM-DD-YYYY —
// silently reinterpreting these files' true DD-MM-YYYY values. Row storage
// itself still uses the XLSX-parsed row objects verbatim (same as
// production would produce from a single-day file), only row *selection*
// uses this text-accurate date. ---
function parseCsvRows(text) {
  const records = [];
  let field = "";
  let record = [];
  let inQuoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuoted = false; }
      else field += ch;
    } else if (ch === '"') {
      inQuoted = true;
    } else if (ch === ",") {
      record.push(field); field = "";
    } else if (ch === "\r") {
      // skip
    } else if (ch === "\n") {
      record.push(field); field = "";
      records.push(record); record = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || record.length > 0) { record.push(field); records.push(record); }
  return records.filter((r) => r.length > 1 || r[0] !== "");
}
function ddmmyyyyToIso(raw) {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (!m) return s;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}
function rawDatesForColumn(buffer, columnName) {
  const csvRecords = parseCsvRows(buffer.toString("latin1").replace(/^﻿|^ï»¿/, ""));
  const header = csvRecords[0];
  const idx = header.indexOf(columnName);
  if (idx === -1) throw new Error(`Column "${columnName}" not found`);
  return csvRecords.slice(1).map((r) => ddmmyyyyToIso(r[idx]));
}

// --- Service Info (mirrors src/lib/service-info/parse.ts) ---
const WHEEL_BALANCING_DESC = "WB (OFF-VEHICLE, TWO WHEELS) - ADJST";
const WHEEL_ALIGNMENT_DESC = "WHEEL ALIGNMENT - INSP";
function isBrakeSkimmingDesc(desc) {
  return /(?:FR|RR) DISC \(ONE SIDE\) \((?:ON|OFF)-VEHICLE\).*GRIND/i.test(desc);
}
const EVAPORATOR_CLEANING_DESC = "TGLOSS Air Fresh-Front Evaporator";
function vasRevenueForRow(jobCode, series, tier) {
  if (tier === null) return 0;
  const treatment = VAS_PRICE_BY_JOB_CODE.get(jobCode);
  if (!treatment) return 0;
  const prices = tier === "A" ? treatment.tierA : treatment.tierB;
  const onlyXl = prices.small === null && prices.medium === null && prices.large === null;
  if (onlyXl) return prices.xl ?? 0;
  const size = seriesToSize(series);
  if (size === null) return 0;
  return prices[size] ?? 0;
}
function serviceInfoCountsFromRows(rows, branch, staffNames) {
  const tier = tierForBranch(branch);
  const counts = { wheelBalancing: 0, wheelAlignment: 0, brakeSkimming: 0, evaporatorCleaning: 0, vasRevenue: 0 };
  const brakeSkimmingRos = new Set();
  for (const [rowIndex, row] of rows.entries()) {
    const desc = normalize(row["Job Desc"]);
    if (desc === WHEEL_BALANCING_DESC) counts.wheelBalancing++;
    else if (desc === WHEEL_ALIGNMENT_DESC) counts.wheelAlignment++;
    else if (isBrakeSkimmingDesc(desc)) brakeSkimmingRos.add(normalize(row["Job Order No"]) || ` row-${rowIndex}`);
    else if (desc === EVAPORATOR_CLEANING_DESC) counts.evaporatorCleaning++;
    const jobCode = normalize(row["Job Code"]);
    const closeSaName = normalize(row["Close Service Advisor Name"]);
    if (jobCode && !isAccessoriesStaff(staffNames, closeSaName)) {
      counts.vasRevenue += vasRevenueForRow(jobCode, normalize(row["Series"]), tier);
    }
  }
  counts.brakeSkimming = brakeSkimmingRos.size;
  return counts;
}

// --- Part Sale (mirrors src/lib/part-sale/parse.ts) ---
const ENGINE_FLUSH_PARTS = ["A-08814-80061", "A-08814-80090"];
const INJECTOR_CLEANER_PARTS = ["A-08813-80100", "A-08813-80019"];
const SYNTHETIC_OIL_PARTS = ["L-0888-080073", "L-0888-080072", "L-0888-080071", "L-0888-084724", "L-0888-084726", "L-0888-084744", "L-0888-084746"];
const BRAKE_CLEANING_SPRAY_PARTS = ["Z-9BCHP-00001"];
const EXTERNAL_SALES_BILL_TYPE = "A";
const EXTERNAL_SALES_PART_PREFIXES = ["D", "L", "Z", "B", "T"];
const EXTERNAL_SALES_EXACT_PARTS = new Set([
  "A-9ADB1-01001",
  "A-9D101-00001", "A-9D102-00002", "A-9D103-00003", "A-9D104-00004",
  "A-9D105-00005", "A-9D106-00006", "A-9D107-00007", "A-9D108-00008",
  "A-9D109-00009", "A-9D110-00010", "A-9D111-00011", "A-9D112-00012",
]);
const DIY_PART_PREFIX = "D-DIY";
function toQty(value) {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}
function isExternalSalesRow(billNo, partNo) {
  if (billNo.charAt(0).toUpperCase() !== EXTERNAL_SALES_BILL_TYPE) return false;
  if (EXTERNAL_SALES_EXACT_PARTS.has(partNo)) return true;
  return EXTERNAL_SALES_PART_PREFIXES.includes(partNo[0]);
}
function partSaleCountsFromRows(rows) {
  let engineFlush = 0, injectorCleaner = 0, syntheticOilRaw = 0, brakeCleaningSpray = 0, externalSales = 0, diyCount = 0, diyRevenue = 0;
  for (const row of rows) {
    const part = normalize(row["PartNo"]);
    const qty = toQty(row["Sale Qty"]);
    if (ENGINE_FLUSH_PARTS.includes(part)) engineFlush += qty;
    else if (INJECTOR_CLEANER_PARTS.includes(part)) injectorCleaner += qty;
    else if (SYNTHETIC_OIL_PARTS.includes(part)) syntheticOilRaw += qty;
    else if (BRAKE_CLEANING_SPRAY_PARTS.includes(part)) brakeCleaningSpray += qty;
    const billNo = normalize(row["BillNo"]);
    if (isExternalSalesRow(billNo, part)) externalSales += toQty(row["NetAmnt"]);
    if (part.toUpperCase().startsWith(DIY_PART_PREFIX)) {
      diyCount += qty;
      diyRevenue += toQty(row["NetAmnt"]);
    }
  }
  return { engineFlush, injectorCleaner, syntheticOilLtrs: syntheticOilRaw / 10, brakeCleaningSpray, externalSales, diyCount, diyRevenue };
}
function looksBinaryWorkbook(buffer) {
  return (buffer[0] === 0x50 && buffer[1] === 0x4b) || (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0);
}
function repairCsvQuotes(buffer) {
  const text = buffer.toString("latin1").replace(/^﻿|^ï»¿/, "");
  let out = "", inQuoted = false, atFieldStart = true;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!inQuoted) {
      if (atFieldStart && ch === '"') { inQuoted = true; atFieldStart = false; }
      else { atFieldStart = ch === "," || ch === "\r" || ch === "\n"; }
      out += ch;
      continue;
    }
    if (ch !== '"') { out += ch; continue; }
    const next = text[i + 1];
    if (next === '"') { out += '""'; i++; }
    else if (next === undefined || next === "," || next === "\r" || next === "\n") { out += '"'; inQuoted = false; atFieldStart = next === ","; }
    else { out += '""'; }
  }
  return Buffer.from(out, "latin1");
}

// Service Info's Invoice Date is genuinely MM-DD/MM-DD-YYYY (unambiguous
// examples in the file, e.g. "08/31/2026", confirm this) — XLSX's own
// serial-number auto-coercion already gets this right (cross-checked
// against every other on-file date this session), so it's read straight
// off the coerced cell. Part Sale's SaleDate is DD-MM-YYYY instead — the
// opposite convention — where XLSX's coercion silently mis-reads it, so
// that one needs the raw-CSV-text extraction (rawDatesForColumn) instead.
function excelSerialToIso(serial) {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

function loadServiceInfoRowsWithDates(filePath, dateColumn) {
  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return rows.map((row) => {
    const raw = row[dateColumn];
    const date = typeof raw === "number" ? excelSerialToIso(raw) : ddmmyyyyToIso(raw);
    return { row, date };
  });
}

function loadPartSaleRowsWithDates(filePath, dateColumn) {
  const buffer = fs.readFileSync(filePath);
  const repaired = !looksBinaryWorkbook(buffer) ? repairCsvQuotes(buffer) : null;
  const workbook = XLSX.read(repaired ?? buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  const dates = rawDatesForColumn(repaired ?? buffer, dateColumn);
  return rows.map((row, i) => ({ row, date: dates[i] }));
}

async function replaceDay(client, { reportType, date, branch, sourceFileName, uploadedAt, rows }) {
  await client.query(`delete from raw_upload_rows where report_type=$1 and date=$2 and branch=$3`, [reportType, date, branch]);
  if (rows.length > 0) {
    const branches = rows.map(() => branch);
    const rowIndexes = rows.map((_, i) => i);
    const rowDatas = rows.map((r) => JSON.stringify(r ?? {}));
    await client.query(
      `insert into raw_upload_rows (report_type, date, branch, uploaded_at, source_file_name, row_index, row_data)
       select $1, $2, b, $3, $4, i, d::jsonb
       from unnest($5::text[], $6::int[], $7::text[]) as t(b, i, d)`,
      [reportType, date, uploadedAt, sourceFileName, branches, rowIndexes, rowDatas]
    );
  }
}

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const uploadedAt = new Date().toISOString();
  const correctionNote = "corrected 2026-09-12 from cumulative 01-11 Sep DMS export — see docs/data-reconciliation.md";

  // --- Service Info-GS, 07 Sep ---
  const siRows = loadServiceInfoRowsWithDates(SERVICE_INFO_FILE, "Invoice Date")
    .filter((r) => r.date === SERVICE_INFO_DATE)
    .map((r) => r.row);
  const siCounts = serviceInfoCountsFromRows(siRows, BRANCH, STAFF_NAMES);

  const { rows: siBefore } = await client.query(
    `select date::text, wheel_balancing, wheel_alignment, brake_skimming, evaporator_cleaning, vas_revenue, source_file_name
       from service_info_snapshots where branch=$1 and date=$2`,
    [BRANCH, SERVICE_INFO_DATE]
  );
  console.log("Service Info", SERVICE_INFO_DATE, "— before:", siBefore[0]);
  console.log("Service Info", SERVICE_INFO_DATE, `— after (${siRows.length} true rows):`, siCounts);

  // --- Part Sale, 03 Sep ---
  const psRows = loadPartSaleRowsWithDates(PART_SALE_FILE, "SaleDate")
    .filter((r) => r.date === PART_SALE_DATE)
    .map((r) => r.row);
  const psCounts = partSaleCountsFromRows(psRows);

  const { rows: psBefore } = await client.query(
    `select date::text, engine_flush, injector_cleaner, synthetic_oil_ltrs, brake_cleaning_spray, external_sales, diy_count, diy_revenue, source_file_name
       from part_sale_snapshots where branch=$1 and date=$2`,
    [BRANCH, PART_SALE_DATE]
  );
  console.log("\nPart Sale", PART_SALE_DATE, "— before:", psBefore[0]);
  console.log("Part Sale", PART_SALE_DATE, `— after (${psRows.length} true rows):`, psCounts);

  if (!COMMIT) {
    console.log("\nDry run — re-run with --commit to apply.");
    process.exit(0);
  }

  await client.query("begin");

  await replaceDay(client, {
    reportType: "service_info",
    date: SERVICE_INFO_DATE,
    branch: BRANCH,
    sourceFileName: `${SERVICE_INFO_FILE.split(/[\\/]/).pop()} (${correctionNote})`,
    uploadedAt,
    rows: siRows,
  });
  await client.query(
    `update service_info_snapshots
       set wheel_balancing=$3, wheel_alignment=$4, brake_skimming=$5, evaporator_cleaning=$6, vas_revenue=$7,
           uploaded_at=$8, source_file_name=$9
     where branch=$1 and date=$2`,
    [
      BRANCH, SERVICE_INFO_DATE,
      siCounts.wheelBalancing, siCounts.wheelAlignment, siCounts.brakeSkimming, siCounts.evaporatorCleaning, siCounts.vasRevenue,
      uploadedAt, `Ser Info Report GS.csv (${correctionNote})`,
    ]
  );

  await replaceDay(client, {
    reportType: "part_sale",
    date: PART_SALE_DATE,
    branch: BRANCH,
    sourceFileName: `${PART_SALE_FILE.split(/[\\/]/).pop()} (${correctionNote})`,
    uploadedAt,
    rows: psRows,
  });
  await client.query(
    `update part_sale_snapshots
       set engine_flush=$3, injector_cleaner=$4, synthetic_oil_ltrs=$5, brake_cleaning_spray=$6, external_sales=$7, diy_count=$8, diy_revenue=$9,
           uploaded_at=$10, source_file_name=$11
     where branch=$1 and date=$2`,
    [
      BRANCH, PART_SALE_DATE,
      psCounts.engineFlush, psCounts.injectorCleaner, psCounts.syntheticOilLtrs, psCounts.brakeCleaningSpray, psCounts.externalSales, psCounts.diyCount, psCounts.diyRevenue,
      uploadedAt, `SPRT014_PartSaleReport.csv (${correctionNote})`,
    ]
  );

  await client.query("commit");
  console.log("\nCommitted.");

  const { rows: siAfter } = await client.query(
    `select date::text, wheel_balancing, wheel_alignment, brake_skimming, evaporator_cleaning, vas_revenue from service_info_snapshots where branch=$1 and date=$2`,
    [BRANCH, SERVICE_INFO_DATE]
  );
  const { rows: psAfter } = await client.query(
    `select date::text, engine_flush, injector_cleaner, synthetic_oil_ltrs, brake_cleaning_spray, external_sales, diy_count, diy_revenue from part_sale_snapshots where branch=$1 and date=$2`,
    [BRANCH, PART_SALE_DATE]
  );
  console.log("Service Info after (DB):", siAfter[0]);
  console.log("Part Sale after (DB):", psAfter[0]);
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}
