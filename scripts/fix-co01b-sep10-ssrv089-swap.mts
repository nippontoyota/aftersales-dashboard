// One-off: CO01B uploaded its 10 Sep "Cost and Sales Report" GS and BP files
// into each other's slots. The GS file (163 rows, all GSJ job orders — real
// GS closers: Dileep R, Arun V K, Jopaul P J, etc., roster-matched Jeeshan V
// P / Vivek Lal T J / Antony Anoop) landed in the ssrv089_bp slot, stored raw
// and never counted. The 30-row BP file (all BPJ job orders) landed in the
// GS slot, so the parsed ssrv089 (general) snapshot for CO01B / 10 Sep came
// out to accessories 0/0 — none of those 30 rows' closers are on the GS
// roster (they're Body & Paint staff).
//
// This re-parses the real GS file (from where it's sitting, raw_report_uploads
// ssrv089_bp) as the general-variant ssrv089 snapshot + raw rows, and puts
// the BP content (reconstructed from the 30 rows already parsed into
// raw_upload_rows) back into the ssrv089_bp slot. Nothing else — part_sale /
// service_info / scom205 for that day were fine.
//
//   npx tsx scripts/fix-co01b-sep10-ssrv089-swap.mts [--commit]
import "./load-env.mjs";
import { parseSsrv089Workbook } from "../src/lib/ssrv089/parse";
import { saveSsrv089Snapshot, loadSsrv089Snapshot } from "../src/lib/ssrv089/store";
import { saveRawUploadRows } from "../src/lib/raw-upload-rows/store";
import { saveRawReportUpload } from "../src/lib/raw-report-uploads/store";
import { listAccessoriesStaffNamesForBranch } from "../src/lib/accessories-staff-store";
import { pool } from "../src/lib/db";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "CO01B";
const DATE = "2026-09-10";

// --- the GS-content file, currently mis-filed in the BP slot ---
const gsRow = await pool.query<{ file_data: Buffer; source_file_name: string }>(
  `select file_data, source_file_name from raw_report_uploads
    where branch = $1 and report_type = 'ssrv089_bp' and date = $2`,
  [BRANCH, DATE],
);
if (gsRow.rows.length === 0) throw new Error("no ssrv089_bp upload found for CO01B 10 Sep");
const gsBuf: Buffer = gsRow.rows[0].file_data;
const gsName = gsRow.rows[0].source_file_name;

// --- the BP-content rows, currently mis-parsed into the GS snapshot ---
const bpRows = await pool.query<{ row_data: Record<string, unknown> }>(
  `select row_data from raw_upload_rows
    where branch = $1 and report_type = 'ssrv089' and date = $2 order by row_index`,
  [BRANCH, DATE],
);

function toCsv(rows: Record<string, unknown>[]): Buffer {
  if (rows.length === 0) return Buffer.from("");
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))];
  return Buffer.from(lines.join("\r\n"), "utf8");
}
const bpCsv = toCsv(bpRows.rows.map((r) => r.row_data));

// --- parse the real GS file the same way the upload route does ---
const staff = await listAccessoriesStaffNamesForBranch(BRANCH);
const gs = parseSsrv089Workbook(gsBuf, staff);

const before = await loadSsrv089Snapshot(DATE, BRANCH, "general");
console.log(`CO01B accessories roster: ${staff.join(", ") || "(none)"}\n`);
console.log("GS file (from BP slot):", gsName, `— ${gs.rawRows.length} rows`);
console.log("BP content (", bpRows.rows.length, "rows ) → reconstructed CSV,", bpCsv.length, "bytes\n");
console.log("ssrv089 (general) snapshot for CO01B 2026-09-10:");
console.log("  before:", before ? JSON.stringify(before.totals) : "(none)");
console.log("  after :", JSON.stringify(gs.totals));

if (!COMMIT) {
  console.log("\nDry run — re-run with --commit to write.");
  await pool.end();
  process.exit(0);
}

const at = new Date().toISOString();

await saveSsrv089Snapshot({ date: DATE, branch: BRANCH, variant: "general", uploadedAt: at, sourceFileName: gsName, totals: gs.totals });
await saveRawUploadRows({
  reportType: "ssrv089",
  date: DATE,
  uploadedAt: at,
  sourceFileName: gsName,
  rows: gs.rawRows.map((data) => ({ branch: BRANCH, data })),
});
await saveRawReportUpload({
  date: DATE,
  branch: BRANCH,
  reportType: "ssrv089_bp",
  uploadedAt: at,
  sourceFileName: `CO01B-ssrv089-BP-${DATE}-reconstructed.csv`,
  fileData: bpCsv,
});

console.log("\nCommitted — CO01B 10 Sep ssrv089 un-swapped.");
await pool.end();
