// IR01A, 8 Sep SSRV089 snapshot: one row (Job Order GSJ26-06993, Invoice
// TXL26-04331, real date 4 Sep) was closed by "Albin James 2856" — Part Sale
// ₹1,531, Labour Sale ₹7.90. He is NOT on IR01A's Accessories roster (he's a
// service advisor, not accessories staff) and this is his only row all
// month, so he isn't being added to `accessories_staff` — that would wrongly
// deduct any of his ordinary service-advisor sales too, present or future.
//
// HQ confirmed 2026-09-11: the sale did happen and should be counted as
// accessories this one time. So this is a manual one-off addition straight
// to the snapshot's two accessories_* totals, not a roster change and not
// something `recompute-ssrv089-accessories.mjs` will reproduce (a rerun of
// that script for IR01A would wipe this back out — re-apply this script
// after any such recompute).
//
//   node scripts/fix-ir01a-albin-james-onetime.mjs [--commit]
import { Client } from "pg";
import "./load-env.mjs";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "IR01A";
const DATE = "2026-09-08"; // the snapshot slot this row's upload landed on
const PART = 1531;
const LABOUR = 7.9;

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows: before } = await client.query(
    `select accessories_part_sale, accessories_labour_sale from ssrv089_snapshots
      where branch=$1 and variant='general' and date=$2`,
    [BRANCH, DATE]
  );
  if (before.length === 0) {
    console.error(`No ${DATE} general ssrv089 snapshot for ${BRANCH} — nothing to update.`);
    process.exit(1);
  }
  const partBefore = Number(before[0].accessories_part_sale);
  const labourBefore = Number(before[0].accessories_labour_sale);
  console.log(`Before: parts ${partBefore.toFixed(2)}, labour ${labourBefore.toFixed(2)}`);
  console.log(`After:  parts ${(partBefore + PART).toFixed(2)}, labour ${(labourBefore + LABOUR).toFixed(2)}`);

  if (!COMMIT) {
    console.log("\nDry run — re-run with --commit to apply.");
    process.exit(0);
  }

  await client.query(
    `update ssrv089_snapshots
        set accessories_part_sale = accessories_part_sale + $3,
            accessories_labour_sale = accessories_labour_sale + $4,
            uploaded_at = now()
      where branch = $1 and variant = 'general' and date = $2`,
    [BRANCH, DATE, PART, LABOUR]
  );
  console.log("\nCommitted.");
} finally {
  await client.end();
}
