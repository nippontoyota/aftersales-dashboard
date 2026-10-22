// Follow-up: the first check found RefDocNo ∩ SSRV089's JobOrder No = 37/73,
// but RefDocNo ∩ Service Info's Job Order No = 0 — because SSRV089/Part Sale
// use a dashed RO format ("GSJ26-13877") while Service Info/Labour Sales use
// an undashed one ("GSJ2610338"), same scheme, different formatting per
// report. Re-checking with dashes stripped on both sides, and at row level
// (not just distinct values) to see real coverage.
import "./load-env.mjs";
import { pool } from "../src/lib/db";

function stripDash(v: unknown): string {
  return String(v ?? "").trim().replace(/-/g, "").toUpperCase();
}

const { rows: candidateDates } = await pool.query<{ branch: string; date: string }>(
  `select ps.branch, ps.date::text as date
     from (select distinct branch, date from raw_upload_rows where report_type = 'part_sale') ps
     join (select distinct branch, date from raw_upload_rows where report_type = 'service_info') si
       on si.branch = ps.branch and si.date = ps.date
     join (select distinct branch, date from raw_upload_rows where report_type = 'ssrv089') sv
       on sv.branch = ps.branch and sv.date = ps.date
     order by ps.date desc
     limit 3`,
);

for (const { branch, date } of candidateDates) {
  console.log(`\n=== ${branch} / ${date} ===`);
  const { rows: psRows } = await pool.query<{ row_data: Record<string, unknown> }>(
    `select row_data from raw_upload_rows where report_type = 'part_sale' and branch = $1 and date = $2`,
    [branch, date],
  );
  const { rows: siRows } = await pool.query<{ row_data: Record<string, unknown> }>(
    `select row_data from raw_upload_rows where report_type = 'service_info' and branch = $1 and date = $2`,
    [branch, date],
  );
  const { rows: ssrvRows } = await pool.query<{ row_data: Record<string, unknown> }>(
    `select row_data from raw_upload_rows where report_type = 'ssrv089' and branch = $1 and date = $2`,
    [branch, date],
  );

  const siJobOrderNos = new Set(siRows.map((r) => stripDash(r.row_data["Job Order No"])).filter(Boolean));
  const ssrvJobOrderNos = new Map<string, string>(); // normalized -> Close SA Name
  for (const r of ssrvRows) {
    const key = stripDash(r.row_data["JobOrder No"]);
    if (key) ssrvJobOrderNos.set(key, String(r.row_data["Close SA Name"] ?? ""));
  }
  const siCloseSaByRo = new Map<string, string>();
  for (const r of siRows) {
    const key = stripDash(r.row_data["Job Order No"]);
    if (key) siCloseSaByRo.set(key, String(r.row_data["Close Service Advisor Name"] ?? ""));
  }

  let rowsWithRefDoc = 0;
  let rowsMatchedSsrv = 0;
  let rowsMatchedSi = 0;
  let rowsMatchedEither = 0;
  for (const r of psRows) {
    const refDoc = stripDash(r.row_data["RefDocNo"]);
    if (!refDoc) continue;
    rowsWithRefDoc++;
    const inSsrv = ssrvJobOrderNos.has(refDoc);
    const inSi = siCloseSaByRo.has(refDoc);
    if (inSsrv) rowsMatchedSsrv++;
    if (inSi) rowsMatchedSi++;
    if (inSsrv || inSi) rowsMatchedEither++;
  }

  console.log(`part_sale rows: ${psRows.length}, with non-blank RefDocNo: ${rowsWithRefDoc}`);
  console.log(`  matched to an SSRV089 RO (dash-stripped): ${rowsMatchedSsrv}`);
  console.log(`  matched to a Service Info RO (dash-stripped): ${rowsMatchedSi}`);
  console.log(`  matched to EITHER: ${rowsMatchedEither} (${rowsWithRefDoc > 0 ? ((rowsMatchedEither / rowsWithRefDoc) * 100).toFixed(0) : 0}% of rows with a RefDocNo)`);
  console.log(`  of all ${psRows.length} part_sale rows: ${((rowsMatchedEither / psRows.length) * 100).toFixed(0)}% land on a known RO`);
}

await pool.end();
