// Backfills ssrv089_bp_grey_snapshots from already-uploaded Cost and Sales
// Report - BP files in raw_report_uploads — for branches that filed BP
// uploads before this table existed (2026-10-01). Mirrors
// src/lib/ssrv089-bp/parse.ts exactly; see that file's doc comment for why
// this exists (scom205 excludes Grey-brand revenue entirely).
//
//   node scripts/backfill-ssrv089-bp-grey.mjs <BRANCH> [YYYY-MM-DD] [--commit]
//
// <BRANCH>      branch code, e.g. TI01A
// [YYYY-MM-DD]  only uploads on/after this date (default 2026-09-01)
// --commit      apply; without it, dry run
import { Client } from "pg";
import * as XLSX from "xlsx";
import "./load-env.mjs";

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");
const positional = args.filter((a) => !a.startsWith("--"));
const BRANCH = positional[0];
const FROM = positional[1] || "2026-09-01";

if (!BRANCH || !/^[A-Z]{2}\d{2}[A-Z]$/.test(BRANCH)) {
  console.error("Usage: node scripts/backfill-ssrv089-bp-grey.mjs <BRANCH> [YYYY-MM-DD] [--commit]");
  process.exit(1);
}

const CLOSE_SA_NAME_COLUMN = "Close SA Name";
const BRAND_COLUMN = "Brand(Toyota/Grey)";
const PART_SALE_COLUMN = "Part Sale";
const PNT_MAT_SALE_COLUMN = "Pnt Mat Sale";
const LABOUR_SALE_COLUMN = "Labour Sale";

function toAmount(value) {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

// Mirrors src/lib/ssrv089-bp/parse.ts exactly (2026-10-02): the header row
// is checked directly, not `column in rows[0]`, so a correctly-shaped file
// with zero data rows is still recognized rather than rejected; Brand is
// optional beyond that baseline (some branches' DMS never includes it).
function findDataSheet(workbook) {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const headerRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    const header = (headerRows[0] ?? []).map((c) => String(c ?? "").trim());
    if (header.includes(CLOSE_SA_NAME_COLUMN) && header.includes(PART_SALE_COLUMN)) {
      return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
    }
  }
  return null;
}

function parseGreyTotals(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const rows = findDataSheet(workbook);
  if (!rows) throw new Error(`no sheet with a "${CLOSE_SA_NAME_COLUMN}" column`);
  if (rows.length === 0 || !(BRAND_COLUMN in rows[0])) return { greyPartsSale: 0, greyLabourSale: 0 };

  let greyPartsSale = 0;
  let greyLabourSale = 0;
  for (const row of rows) {
    const brand = String(row[BRAND_COLUMN] ?? "").trim().toUpperCase();
    if (brand !== "GREY") continue;
    greyPartsSale += toAmount(row[PART_SALE_COLUMN]) + toAmount(row[PNT_MAT_SALE_COLUMN]);
    greyLabourSale += toAmount(row[LABOUR_SALE_COLUMN]);
  }
  return { greyPartsSale, greyLabourSale };
}

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows: uploads } = await client.query(
    `select date::text as date, uploaded_at, source_file_name, file_data
       from raw_report_uploads
      where report_type = 'ssrv089_bp' and branch = $1 and date >= $2
      order by date`,
    [BRANCH, FROM]
  );
  if (uploads.length === 0) {
    console.log(`No ssrv089_bp raw uploads for ${BRANCH} on/after ${FROM}.`);
    process.exit(0);
  }

  const toApply = [];
  for (const u of uploads) {
    let totals;
    try {
      totals = parseGreyTotals(u.file_data);
    } catch (err) {
      console.log(`${u.date}  ${u.source_file_name}  — could not parse: ${err.message}`);
      continue;
    }
    console.log(
      `${u.date}  ${u.source_file_name}  Grey Parts ${totals.greyPartsSale.toFixed(2)}  Grey Labour ${totals.greyLabourSale.toFixed(2)}`
    );
    toApply.push({ date: u.date, uploadedAt: u.uploaded_at, sourceFileName: u.source_file_name, totals });
  }

  console.log(`\n${toApply.length} snapshot(s) to write.`);
  if (!COMMIT) {
    console.log("Dry run — re-run with --commit to apply.");
    process.exit(0);
  }
  if (toApply.length === 0) {
    console.log("Nothing to write.");
    process.exit(0);
  }

  await client.query("begin");
  for (const s of toApply) {
    await client.query(
      `insert into ssrv089_bp_grey_snapshots (date, branch, uploaded_at, source_file_name, grey_parts_sale, grey_labour_sale)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (date, branch) do update set
         uploaded_at = excluded.uploaded_at,
         source_file_name = excluded.source_file_name,
         grey_parts_sale = excluded.grey_parts_sale,
         grey_labour_sale = excluded.grey_labour_sale`,
      [s.date, BRANCH, s.uploadedAt, s.sourceFileName, s.totals.greyPartsSale, s.totals.greyLabourSale]
    );
  }
  await client.query("commit");
  console.log(`\nCommitted. ${toApply.length} snapshot(s) written.`);
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}
