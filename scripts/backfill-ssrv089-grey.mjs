// Recomputes grey_part_sale/grey_labour_sale on ssrv089_snapshots (variant
// 'general') from the raw rows already on file in raw_upload_rows -- for
// snapshots saved before those two columns existed (they default to 0).
// Mirrors src/lib/ssrv089/parse.ts's grey-sum logic exactly.
//
//   node scripts/backfill-ssrv089-grey.mjs <BRANCH> [YYYY-MM-DD] [--commit]
//
// <BRANCH>      branch code, e.g. CO01B
// [YYYY-MM-DD]  only snapshots on/after this date (default 2026-09-01)
// --commit      apply; without it, dry run
import { Client } from "pg";
import "./load-env.mjs";

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");
const positional = args.filter((a) => !a.startsWith("--"));
const BRANCH = positional[0];
const FROM = positional[1] || "2026-09-01";

if (!BRANCH || !/^[A-Z]{2}\d{2}[A-Z]$/.test(BRANCH)) {
  console.error("Usage: node scripts/backfill-ssrv089-grey.mjs <BRANCH> [YYYY-MM-DD] [--commit]");
  process.exit(1);
}

function toAmount(value) {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows: snapshots } = await client.query(
    `select date::text as date, source_file_name, grey_part_sale, grey_labour_sale
       from ssrv089_snapshots
      where branch = $1 and variant = 'general' and date >= $2
      order by date`,
    [BRANCH, FROM]
  );
  if (snapshots.length === 0) {
    console.log(`No ssrv089 'general' snapshots for ${BRANCH} on/after ${FROM}.`);
    process.exit(0);
  }

  const updates = [];
  for (const snap of snapshots) {
    const { rows: raw } = await client.query(
      "select row_data from raw_upload_rows where report_type = 'ssrv089' and branch = $1 and date = $2",
      [BRANCH, snap.date]
    );
    if (raw.length === 0) {
      console.log(`${snap.date}  — no raw rows on file, skipping`);
      continue;
    }

    let greyPartSale = 0;
    let greyLabourSale = 0;
    for (const { row_data } of raw) {
      const brand = String(row_data["Brand(Toyota/Grey)"] ?? "").trim().toUpperCase();
      if (brand !== "GREY") continue;
      greyPartSale += toAmount(row_data["Part Sale"]);
      greyLabourSale += toAmount(row_data["Labour Sale"]);
    }

    const now = { greyPartSale: Number(snap.grey_part_sale), greyLabourSale: Number(snap.grey_labour_sale) };
    const changed = now.greyPartSale.toFixed(2) !== greyPartSale.toFixed(2) || now.greyLabourSale.toFixed(2) !== greyLabourSale.toFixed(2);
    console.log(
      `${snap.date}  (${raw.length} rows)  ${snap.source_file_name}` +
        `   Grey Parts ${now.greyPartSale.toFixed(2)} -> ${greyPartSale.toFixed(2)}` +
        `   Grey Labour ${now.greyLabourSale.toFixed(2)} -> ${greyLabourSale.toFixed(2)}` +
        (changed ? "   *" : "")
    );
    if (changed) updates.push({ date: snap.date, greyPartSale, greyLabourSale });
  }

  console.log(`\n${updates.length} snapshot(s) to update.`);
  if (!COMMIT) {
    console.log("Dry run — re-run with --commit to apply.");
    process.exit(0);
  }
  if (updates.length === 0) {
    console.log("Nothing to update.");
    process.exit(0);
  }

  await client.query("begin");
  for (const u of updates) {
    await client.query(
      `update ssrv089_snapshots set grey_part_sale = $3, grey_labour_sale = $4
        where branch = $1 and variant = 'general' and date = $2`,
      [BRANCH, u.date, u.greyPartSale, u.greyLabourSale]
    );
  }
  await client.query("commit");
  console.log(`\nCommitted. ${updates.length} snapshot(s) updated.`);
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}
