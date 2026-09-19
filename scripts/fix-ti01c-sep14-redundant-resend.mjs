// TI01C's "14 Sep" Service Info-GS and SSRV089-General uploads are, yet
// again, stale resends — not even of the 13th's cumulative file, but a
// straight repeat of the ORIGINAL 10 Sep single-day file (literal filenames
// "Service_Info_Report-TI01C-1 service.csv" / "SSRV089_CostAndSalesReport-
// service.csv" match the 9-10 Sep originals; every job order in both is
// already fully contained in the 13 Sep cumulative snapshot). The 14th
// contributes zero new information — this is the fourth occurrence of this
// exact resend bug for this branch this month.
//
// Deletes the 14 Sep service_info and ssrv089-general snapshots + raw rows
// entirely, reverting to "not yet uploaded for the 14th" — 13 Sep's
// cumulative snapshot remains the current, correct MTD holder.
//
//   node scripts/fix-ti01c-sep14-redundant-resend.mjs [--commit]
import { Client } from "pg";
import "./load-env.mjs";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "TI01C";
const REDUNDANT_DATE = "2026-09-14";
const CURRENT_DATE = "2026-09-13";

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  for (const [type, table, keyCol, variantClause] of [
    ["service_info", "service_info_snapshots", "Job Order No", ""],
    ["ssrv089", "ssrv089_snapshots", "JobOrder No", " and variant='general'"],
  ]) {
    const { rows: redundantRows } = await client.query(
      `select row_data->>'${keyCol}' as k from raw_upload_rows where report_type=$1 and branch=$2 and date=$3`,
      [type, BRANCH, REDUNDANT_DATE]
    );
    const { rows: currentRows } = await client.query(
      `select row_data->>'${keyCol}' as k from raw_upload_rows where report_type=$1 and branch=$2 and date=$3`,
      [type, BRANCH, CURRENT_DATE]
    );
    const currentKeys = new Set(currentRows.map((r) => r.k));
    const redundantKeys = new Set(redundantRows.map((r) => r.k));
    const notContained = [...redundantKeys].filter((k) => !currentKeys.has(k));
    if (redundantKeys.size === 0 || notContained.length > 0) {
      console.error(`\nABORT (${type}): 14 Sep is no longer fully contained in 13 Sep. Re-investigate.`, { redundantCount: redundantKeys.size, notContained });
      process.exit(1);
    }
    console.log(`Safety check passed for ${type}: all ${redundantKeys.size} job orders in the 14 Sep file are already in 13 Sep's.`);
  }

  if (!COMMIT) {
    console.log("\nDry run — re-run with --commit to apply.");
    process.exit(0);
  }

  await client.query("begin");
  const delSi = await client.query(`delete from service_info_snapshots where branch=$1 and date=$2`, [BRANCH, REDUNDANT_DATE]);
  const delSsrv = await client.query(`delete from ssrv089_snapshots where branch=$1 and variant='general' and date=$2`, [BRANCH, REDUNDANT_DATE]);
  const delRaw = await client.query(
    `delete from raw_upload_rows where branch=$1 and date=$2 and report_type in ('service_info','ssrv089')`,
    [BRANCH, REDUNDANT_DATE]
  );
  await client.query("commit");
  console.log(`\nCommitted. Deleted service_info=${delSi.rowCount}, ssrv089=${delSsrv.rowCount} snapshot(s), ${delRaw.rowCount} raw row(s).`);
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}
