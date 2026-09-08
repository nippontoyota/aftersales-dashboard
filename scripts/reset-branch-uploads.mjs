// Wipe a branch's daily-report uploads on/after a date, so it can re-upload
// from scratch — for when a branch (usually a first-timer) has filed files
// under the wrong dates / made a mess catching up.
//
//   node scripts/reset-branch-uploads.mjs <BRANCH> <FROM-DATE> [--commit]
//
// <BRANCH>     branch code, e.g. MV01A
// <FROM-DATE>  YYYY-MM-DD, inclusive — everything on/after this goes
// --commit     apply; without it, dry run (prints what would be deleted)
//
// Clears, for that branch, on/after FROM-DATE:
//   service_info_snapshots · ssrv089_snapshots · part_sale_snapshots ·
//   scom205_snapshots        (the parsed GS-variant snapshots)
//   raw_report_uploads       (the stored BP-variant files)
//   raw_upload_rows          EXCEPT report_type = 'ba_tool'  (those belong
//                            to HQ's company-wide BA Tool upload, not the
//                            branch — never touch them)
//
// Does NOT touch: BA Tool snapshots, Bills, Cancellation Reports, the
// Accessories roster, or any date before FROM-DATE.
//
// History: first run for MV01A, 2026-09-01 onward, 2026-09-08.
import { Client } from "pg";
import "./load-env.mjs";

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");
const [BRANCH, FROM] = args.filter((a) => !a.startsWith("--"));

if (!BRANCH || !/^[A-Z]{2}\d{2}[A-Z]$/.test(BRANCH) || !FROM || !/^\d{4}-\d{2}-\d{2}$/.test(FROM)) {
  console.error("Usage: node scripts/reset-branch-uploads.mjs <BRANCH> <YYYY-MM-DD> [--commit]");
  process.exit(1);
}

const SNAPSHOT_TABLES = [
  "service_info_snapshots",
  "ssrv089_snapshots",
  "part_sale_snapshots",
  "scom205_snapshots",
];

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  console.log(`Reset ${BRANCH} daily-report uploads on/after ${FROM}\n`);

  const plan = [];
  for (const tbl of SNAPSHOT_TABLES) {
    const { rows } = await client.query(
      `select count(*)::int n, string_agg(distinct date::text, ', ' order by date::text) dates
         from ${tbl} where branch = $1 and date >= $2`,
      [BRANCH, FROM]
    );
    plan.push({ tbl, n: rows[0].n, dates: rows[0].dates });
  }
  {
    const { rows } = await client.query(
      `select count(*)::int n, string_agg(distinct report_type || ' ' || date::text, ', ' order by report_type || ' ' || date::text) detail
         from raw_report_uploads where branch = $1 and date >= $2`,
      [BRANCH, FROM]
    );
    plan.push({ tbl: "raw_report_uploads", n: rows[0].n, dates: rows[0].detail });
  }
  {
    const { rows } = await client.query(
      `select count(*)::int n, string_agg(distinct report_type, ', ' order by report_type) types
         from raw_upload_rows where branch = $1 and date >= $2 and report_type <> 'ba_tool'`,
      [BRANCH, FROM]
    );
    plan.push({ tbl: "raw_upload_rows (excl. ba_tool)", n: rows[0].n, dates: rows[0].types });
  }
  const { rows: keep } = await client.query(
    `select count(*)::int n from raw_upload_rows where branch = $1 and date >= $2 and report_type = 'ba_tool'`,
    [BRANCH, FROM]
  );

  for (const p of plan) console.log(`  ${p.tbl.padEnd(34)} ${String(p.n).padStart(5)}   ${p.dates ?? "—"}`);
  console.log(`\n  keeping ${keep[0].n} raw_upload_rows rows with report_type = 'ba_tool' (HQ's BA Tool upload)`);
  const total = plan.reduce((s, p) => s + p.n, 0);
  console.log(`\n  ${total} rows would be deleted.`);

  if (!COMMIT) {
    console.log("\nDry run — re-run with --commit to apply.");
    process.exit(0);
  }
  if (total === 0) {
    console.log("\nNothing to delete.");
    process.exit(0);
  }

  await client.query("begin");
  for (const tbl of SNAPSHOT_TABLES) {
    await client.query(`delete from ${tbl} where branch = $1 and date >= $2`, [BRANCH, FROM]);
  }
  await client.query(`delete from raw_report_uploads where branch = $1 and date >= $2`, [BRANCH, FROM]);
  await client.query(
    `delete from raw_upload_rows where branch = $1 and date >= $2 and report_type <> 'ba_tool'`,
    [BRANCH, FROM]
  );
  await client.query("commit");
  console.log(`\nCommitted. ${BRANCH} can now re-upload every date from ${FROM}.`);
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}
