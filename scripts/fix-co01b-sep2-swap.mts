// One-off: CO01B uploaded its 2 Sep General-Service and Body & Paint
// service-info files into each other's slots (on 3 Sep). The GS file
// (367 rows — 13 wheel balancing, 19 alignment, 7 evaporator, 112 T-Gloss
// lines) landed in the service_info_bp slot, where it's stored raw and
// never counted; the 25-row BP file landed in the GS slot, so the parsed
// service_info snapshot for CO01B / 2 Sep is all zeros.
//
// This re-parses the real GS file (from where it's sitting, raw_report_uploads
// service_info_bp) as the GS snapshot + raw rows, and puts the BP content
// (reconstructed from the 25 rows already parsed into raw_upload_rows) back
// into the service_info_bp slot. Nothing else — part_sale / ssrv089 / scom205
// for that day were fine.
//
//   npx tsx scripts/fix-co01b-sep2-swap.mts [--commit]
import "./load-env.mjs";
import { parseServiceInfoWorkbook } from "../src/lib/service-info/parse";
import { saveServiceInfoSnapshot, loadServiceInfoSnapshot } from "../src/lib/service-info/store";
import { saveRawUploadRows } from "../src/lib/raw-upload-rows/store";
import { saveRawReportUpload } from "../src/lib/raw-report-uploads/store";
import { listAccessoriesStaffNamesForBranch } from "../src/lib/accessories-staff-store";
import { pool } from "../src/lib/db";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "CO01B";
const DATE = "2026-09-02";

// --- the GS-content file, currently mis-filed in the BP slot ---
const gsRow = await pool.query<{ file_data: Buffer; source_file_name: string }>(
  `select file_data, source_file_name from raw_report_uploads
    where branch = $1 and report_type = 'service_info_bp' and date = $2`,
  [BRANCH, DATE],
);
if (gsRow.rows.length === 0) throw new Error("no service_info_bp upload found for CO01B 2 Sep");
const gsBuf: Buffer = gsRow.rows[0].file_data;
const gsName = gsRow.rows[0].source_file_name;

// --- the BP-content rows, currently mis-parsed into the GS snapshot ---
const bpRows = await pool.query<{ row_data: Record<string, unknown> }>(
  `select row_data from raw_upload_rows
    where branch = $1 and report_type = 'service_info' and date = $2 order by row_index`,
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
const gs = parseServiceInfoWorkbook(gsBuf, BRANCH, staff);

const before = await loadServiceInfoSnapshot(DATE, BRANCH);
console.log(`CO01B accessories roster: ${staff.join(", ") || "(none)"}\n`);
console.log("GS file (from BP slot):", gsName, `— ${gs.rawRows.length} rows`);
console.log("BP content (25 rows) → reconstructed CSV,", bpCsv.length, "bytes\n");
console.log("service_info snapshot for CO01B 2026-09-02:");
console.log("  before:", before ? JSON.stringify(before.counts) : "(none)");
console.log("  after :", JSON.stringify(gs.counts));

if (!COMMIT) {
  console.log("\nDry run — re-run with --commit to write.");
  await pool.end();
  process.exit(0);
}

const at = new Date().toISOString();

await saveServiceInfoSnapshot({ date: DATE, branch: BRANCH, uploadedAt: at, sourceFileName: gsName, counts: gs.counts });
await saveRawUploadRows({
  reportType: "service_info",
  date: DATE,
  uploadedAt: at,
  sourceFileName: gsName,
  rows: gs.rawRows.map((data) => ({ branch: BRANCH, data })),
});
await saveRawReportUpload({
  date: DATE,
  branch: BRANCH,
  reportType: "service_info_bp",
  uploadedAt: at,
  sourceFileName: `CO01B-service-info-BP-${DATE}-reconstructed.csv`,
  fileData: bpCsv,
});

console.log("\nCommitted — CO01B 2 Sep service-info un-swapped.");
await pool.end();
