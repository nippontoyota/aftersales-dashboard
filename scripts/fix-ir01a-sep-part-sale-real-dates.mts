// IR01A's September Part Sale data was scattered across upload-date labels
// that don't match each row's own real SaleDate (e.g. the "16 Sep" snapshot
// actually held 17 Sep's business), and 16/17 Sep had real, unbilled-for-us
// gaps (595 rows, ~₹41,861.56 of External Sales, never uploaded under any
// label). The user supplied a fresh authoritative full-month export
// ("sale reporte sep26.csv") whose SaleDate column is a plain DD-MM-YY
// string (not the raw-serial encoding seen on other IR01A/TI01C files) —
// 4,945 of its 5,540 rows already exactly match rows on file (by
// BillNo+PartNo+NetAmnt+Sale Qty), confirming it's consistent with what we
// already have, just the single source of truth for which day each row
// really belongs to.
//
// This re-buckets IR01A's entire September part_sale data by each row's
// real SaleDate straight from this file — replacing (not merging with)
// whatever's currently stored under each real date, since the file's
// per-day content already matches existing data almost exactly. Dates the
// file doesn't cover at all (e.g. after its last row) are left untouched.
//
//   npx tsx scripts/fix-ir01a-sep-part-sale-real-dates.mts [--commit]
import fs from "fs";
import "./load-env.mjs";
import { partSaleCountsFromRows, alwaysEligible } from "../src/lib/part-sale/parse";
import { savePartSaleSnapshot } from "../src/lib/part-sale/store";
import { saveRawUploadRows } from "../src/lib/raw-upload-rows/store";
import { pool } from "../src/lib/db";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "IR01A";
const CSV_PATH = "C:\\Users\\Nippon\\Downloads\\sale reporte sep26.csv";
const SOURCE_FILE_NAME = "sale reporte sep26.csv";

function parseCsv(text: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        field = "";
        if (row.length > 1 || row[0] !== "") lines.push(row);
        row = [];
      } else field += ch;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    lines.push(row);
  }
  return lines;
}

function toIsoDate(ddmmyy: string): string {
  // "16-09-26" -> "2026-09-16"
  const [d, m, y] = ddmmyy.split("-");
  return `20${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

const raw = fs.readFileSync(CSV_PATH, "utf8");
const parsed = parseCsv(raw);
const header = parsed[0];
const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
const dataRows = parsed.slice(1).filter((r) => r.length >= header.length && r[idx["BillNo"]]);

const byDate = new Map<string, Record<string, unknown>[]>();
for (const r of dataRows) {
  const iso = toIsoDate(r[idx["SaleDate"]].trim());
  const rowObj: Record<string, unknown> = {};
  for (const col of header) rowObj[col] = r[idx[col]];
  const list = byDate.get(iso) ?? [];
  list.push(rowObj);
  byDate.set(iso, list);
}

const dates = [...byDate.keys()].sort();
console.log(`Parsed ${dataRows.length} rows across ${dates.length} real calendar dates: ${dates[0]} .. ${dates[dates.length - 1]}\n`);

let totalBefore = 0;
let totalAfter = 0;

for (const date of dates) {
  const rows = byDate.get(date)!;
  const counts = partSaleCountsFromRows(rows, alwaysEligible);

  const { rows: existing } = await pool.query<{ external_sales: string; rows: string }>(
    `select coalesce((select external_sales::text from part_sale_snapshots where branch=$1 and date=$2), 'none') as external_sales,
            (select count(*)::text from raw_upload_rows where report_type='part_sale' and branch=$1 and date=$2) as rows`,
    [BRANCH, date]
  );
  const before = existing[0];
  const beforeExternal = before.external_sales === "none" ? 0 : Number(before.external_sales);
  totalBefore += beforeExternal;
  totalAfter += counts.externalSales;

  const changed = before.external_sales === "none" || Number(before.external_sales).toFixed(2) !== counts.externalSales.toFixed(2) || before.rows !== String(rows.length);
  console.log(
    `${date}  rows ${before.rows} -> ${rows.length}  externalSales ${beforeExternal.toFixed(2)} -> ${counts.externalSales.toFixed(2)}${changed ? "  *" : ""}`
  );

  if (COMMIT) {
    await saveRawUploadRows({
      reportType: "part_sale",
      date,
      uploadedAt: new Date().toISOString(),
      sourceFileName: SOURCE_FILE_NAME,
      rows: rows.map((data) => ({ branch: BRANCH, data })),
    });
    await savePartSaleSnapshot({
      date,
      branch: BRANCH,
      uploadedAt: new Date().toISOString(),
      sourceFileName: SOURCE_FILE_NAME,
      counts,
    });
  }
}

console.log(`\nSeptember External Sales total (only dates covered by this file): ${totalBefore.toFixed(2)} -> ${totalAfter.toFixed(2)}`);
console.log(COMMIT ? "\nCommitted." : "\nDry run — re-run with --commit to write.");
await pool.end();
