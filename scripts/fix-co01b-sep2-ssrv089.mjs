// One-off data correction (2026-09-04): CO01B's 2 Sep SSRV089 General
// Cost & Sales upload was a partial export — 19 rows, only 4 advisors, no
// Accessories-desk staff — so Accessories Part/Labour Sale for that day
// saved as 0. That understated the Accessories deduction and left ~51,813
// of Accessories labour (and ~53,530 of parts) sitting inside CO01B's GUS
// Labour / GUS Parts MTD.
//
// This re-parses the correct full 2 Sep export (201 rows, all CO01B,
// invoice-dated 2 Sep) exactly as src/lib/ssrv089/parse.ts does, then
// replaces the snapshot and the stored raw rows for
// (ssrv089, 2026-09-02, CO01B).
//
//   node scripts/fix-co01b-sep2-ssrv089.mjs "<path to the CSV>" [--commit]
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { Client } from "pg";
import "./load-env.mjs";

const FILE = process.argv[2];
const COMMIT = process.argv.includes("--commit");
if (!FILE) {
  console.error('Usage: node scripts/fix-co01b-sep2-ssrv089.mjs "<path to CSV>" [--commit]');
  process.exit(1);
}

const DATE = "2026-09-02";
const BRANCH = "CO01B";
const VARIANT = "general";

const CLOSE_SA_NAME_COLUMN = "Close SA Name";
const PART_SALE_COLUMN = "Part Sale";
const LABOUR_SALE_COLUMN = "Labour Sale";

const toAmount = (v) => {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};
const normalizeName = (name) => String(name ?? "").replace(/\s+/g, " ").trim().toLowerCase();

function findDataSheet(workbook) {
  for (const name of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: "" });
    if (
      rows.length > 0 &&
      CLOSE_SA_NAME_COLUMN in rows[0] &&
      PART_SALE_COLUMN in rows[0] &&
      LABOUR_SALE_COLUMN in rows[0]
    ) {
      return rows;
    }
  }
  return null;
}

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows: staffRows } = await client.query("select name from accessories_staff where branch = $1", [BRANCH]);
  const staffNames = staffRows.map((r) => normalizeName(r.name));
  const isAccessoriesStaff = (closeSaName) => staffNames.includes(normalizeName(closeSaName));

  const workbook = XLSX.read(readFileSync(FILE), { type: "buffer" });
  const rows = findDataSheet(workbook);
  if (!rows) throw new Error(`No sheet with a "${CLOSE_SA_NAME_COLUMN}" column — is this an SSRV089 Cost & Sales export?`);

  const branches = new Set(rows.map((r) => String(r["Branch Code"] ?? "").trim()));
  if (branches.size !== 1 || !branches.has(BRANCH)) {
    throw new Error(`Expected every row to be ${BRANCH}, got: ${[...branches].join(", ")}`);
  }

  let accessoriesPartSale = 0;
  let accessoriesLabourSale = 0;
  for (const row of rows) {
    if (!isAccessoriesStaff(row[CLOSE_SA_NAME_COLUMN])) continue;
    accessoriesPartSale += toAmount(row[PART_SALE_COLUMN]);
    accessoriesLabourSale += toAmount(row[LABOUR_SALE_COLUMN]);
  }

  const { rows: before } = await client.query(
    "select uploaded_at, source_file_name, accessories_part_sale, accessories_labour_sale from ssrv089_snapshots where date=$1 and branch=$2 and variant=$3",
    [DATE, BRANCH, VARIANT]
  );
  console.log("rows in file:", rows.length);
  console.log("BEFORE:", before[0]);
  console.log("AFTER :", {
    accessories_part_sale: accessoriesPartSale.toFixed(2),
    accessories_labour_sale: accessoriesLabourSale.toFixed(2),
  });

  if (!COMMIT) {
    console.log("\nDry run — re-run with --commit to apply.");
    process.exit(0);
  }

  const uploadedAt = new Date().toISOString();
  const sourceFileName = FILE.split(/[\\/]/).pop();

  await client.query("begin");
  await client.query(
    `update ssrv089_snapshots
       set uploaded_at = $4, source_file_name = $5, accessories_part_sale = $6, accessories_labour_sale = $7
     where date = $1 and branch = $2 and variant = $3`,
    [DATE, BRANCH, VARIANT, uploadedAt, sourceFileName, accessoriesPartSale, accessoriesLabourSale]
  );
  await client.query("delete from raw_upload_rows where report_type = 'ssrv089' and date = $1 and branch = $2", [DATE, BRANCH]);
  for (let i = 0; i < rows.length; i++) {
    await client.query(
      `insert into raw_upload_rows (report_type, date, branch, uploaded_at, source_file_name, row_index, row_data)
       values ('ssrv089', $1, $2, $3, $4, $5, $6::jsonb)`,
      [DATE, BRANCH, uploadedAt, sourceFileName, i, JSON.stringify(rows[i])]
    );
  }
  await client.query("commit");
  console.log(`\nCommitted. Snapshot updated and ${rows.length} raw rows replaced.`);
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}
