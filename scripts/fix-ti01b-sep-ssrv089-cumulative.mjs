// TI01B's September "Cost and Sales Report - GS" (SSRV089) uploads are
// cumulative month-to-date exports too — the same failure mode as the two
// just-fixed report types (service_info: commit dc6d8c4, part_sale: commit
// fc9de99). Verified: every job order in 3 Sep is in 8 Sep; every one in
// 8 Sep is in 9 Sep; every one in 9 Sep is in 10 Sep (102/188/215/242
// distinct jobs, strict supersets — literally the same job orders as
// service_info, since both come from the same GSJ... numbering). The 9 Sep
// and 10 Sep snapshots are byte-identical (same filename, same totals) —
// the branch re-uploaded yesterday's cumulative file again today.
//
// MTD summed all 4 snapshots instead of reading the latest, inflating the
// accessories deduction and understating GUS Parts/Labour MTD by ~₹2 L /
// ~₹29 K (confirmed against the user's own before/after tracking sheet:
// our current buggy GUS Parts MTD, ₹13,18,133, exactly matches their
// "New" figure).
//
//   node scripts/fix-ti01b-sep-ssrv089-cumulative.mjs [--commit]
import { Client } from "pg";
import "./load-env.mjs";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "TI01B";
const SUPERSEDED_DATES = ["2026-09-03", "2026-09-08", "2026-09-09"];

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows: before } = await client.query(
    `select date::text, accessories_part_sale, accessories_labour_sale, source_file_name
       from ssrv089_snapshots where branch=$1 and variant='general' and date >= '2026-09-01' order by date`,
    [BRANCH]
  );
  console.log("Before:", before);

  const { rows: rawCount } = await client.query(
    `select date::text, count(*) from raw_upload_rows where branch=$1 and report_type='ssrv089' and date = any($2::date[]) group by date`,
    [BRANCH, SUPERSEDED_DATES]
  );
  console.log("Raw rows to delete:", rawCount);

  const scom = await client.query(
    `select gus_sp_rev_mtd, gus_lab_rev_mtd from scom205_snapshots where branch=$1 order by date desc limit 1`,
    [BRANCH]
  );
  const gusSp = Number(scom.rows[0].gus_sp_rev_mtd);
  const gusLab = Number(scom.rows[0].gus_lab_rev_mtd);
  const buggyPart = before.reduce((s, r) => s + Number(r.accessories_part_sale), 0);
  const buggyLab = before.reduce((s, r) => s + Number(r.accessories_labour_sale), 0);
  const latest = before[before.length - 1];
  console.log(`\nGUS Parts MTD: ${(gusSp - buggyPart).toFixed(2)} -> ${(gusSp - Number(latest.accessories_part_sale)).toFixed(2)}`);
  console.log(`GUS Labour MTD: ${(gusLab - buggyLab).toFixed(2)} -> ${(gusLab - Number(latest.accessories_labour_sale)).toFixed(2)}`);

  if (!COMMIT) {
    console.log("\nDry run — re-run with --commit to apply.");
    process.exit(0);
  }

  await client.query("begin");
  const delSnap = await client.query(
    `delete from ssrv089_snapshots where branch=$1 and variant='general' and date = any($2::date[])`,
    [BRANCH, SUPERSEDED_DATES]
  );
  const delRaw = await client.query(
    `delete from raw_upload_rows where branch=$1 and report_type='ssrv089' and date = any($2::date[])`,
    [BRANCH, SUPERSEDED_DATES]
  );
  await client.query("commit");
  console.log(`\nCommitted. Deleted ${delSnap.rowCount} snapshot(s), ${delRaw.rowCount} raw row(s).`);

  const { rows: after } = await client.query(
    `select date::text, accessories_part_sale, accessories_labour_sale from ssrv089_snapshots
       where branch=$1 and variant='general' and date >= '2026-09-01' order by date`,
    [BRANCH]
  );
  console.log("After:", after);
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}
