// Read-only: for branch+dates with both service_info and labour_sales rows,
// what fraction of Service Info ROs have a matching Labour Sales Job No.?
// Both reports use the same undashed RO format (confirmed from samples), so
// this is a plain whitespace-normalized match, no dash-stripping needed.
import "./load-env.mjs";
import { pool } from "../src/lib/db";

function normalize(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().toUpperCase();
}

const { rows: candidateDates } = await pool.query<{ branch: string; date: string }>(
  `select si.branch, si.date::text as date
     from (select distinct branch, date from raw_upload_rows where report_type = 'service_info') si
     join (select distinct branch, date from raw_upload_rows where report_type = 'labour_sales') ls
       on ls.branch = si.branch and ls.date = si.date
     order by si.date desc
     limit 5`,
);

if (candidateDates.length === 0) {
  console.log("No branch+date with both service_info and labour_sales rows on the same date found.");
  console.log("Checking whether labour_sales exists at all, and for which branches/dates...");
  const { rows: lsDates } = await pool.query<{ branch: string; date: string; n: string }>(
    `select branch, date::text as date, count(*) as n from raw_upload_rows where report_type = 'labour_sales' group by branch, date order by date desc limit 20`,
  );
  console.log(lsDates);
} else {
  for (const { branch, date } of candidateDates) {
    const { rows: siRows } = await pool.query<{ row_data: Record<string, unknown> }>(
      `select row_data from raw_upload_rows where report_type = 'service_info' and branch = $1 and date = $2`,
      [branch, date],
    );
    const { rows: lsRows } = await pool.query<{ row_data: Record<string, unknown> }>(
      `select row_data from raw_upload_rows where report_type = 'labour_sales' and branch = $1 and date = $2`,
      [branch, date],
    );
    const siRos = new Set(siRows.map((r) => normalize(r.row_data["Job Order No"])).filter(Boolean));
    const lsRos = new Set(lsRows.map((r) => normalize(r.row_data["Job No."])).filter(Boolean));
    const matched = [...siRos].filter((ro) => lsRos.has(ro));
    console.log(
      `${branch} ${date}: SI distinct ROs=${siRos.size}, LS distinct ROs=${lsRos.size}, SI ROs with a LS match=${matched.length} (${siRos.size > 0 ? ((matched.length / siRos.size) * 100).toFixed(0) : 0}%)`,
    );
  }
}

await pool.end();
