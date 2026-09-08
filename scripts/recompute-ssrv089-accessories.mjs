// Recompute a branch's SSRV089 Accessories deduction from the raw rows
// already on file — for when the /data roster is corrected (a name the DMS
// spells differently, e.g. "Anoop P M" on the roster vs "ANOOP M" in the
// export) and the stored accessories_part_sale / accessories_labour_sale
// need to catch up without a re-upload.
//
// Re-derives the totals per snapshot with the SAME match logic as
// src/lib/ssrv089/parse.ts (normalise whitespace + case, exact match
// against the branch's current roster) and rewrites the two accessories_*
// columns. Raw rows are never touched.
//
//   node scripts/recompute-ssrv089-accessories.mjs <BRANCH> [YYYY-MM-DD] [--commit]
//
// <BRANCH>      branch code, e.g. TI01A
// [YYYY-MM-DD]  only recompute snapshots on/after this date (default 2026-09-01)
// --commit      apply; without it, dry run (prints before/after + the MTD effect)
//
// History: first run for PH01A ("Santhosh V M" -> "Santhosh M") 2026-09-08.
import { Client } from "pg";
import "./load-env.mjs";

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");
const positional = args.filter((a) => !a.startsWith("--"));
const BRANCH = positional[0];
const MONTH_START = positional[1] || "2026-09-01";
const VARIANT = "general";

if (!BRANCH || !/^[A-Z]{2}\d{2}[A-Z]$/.test(BRANCH)) {
  console.error("Usage: node scripts/recompute-ssrv089-accessories.mjs <BRANCH> [YYYY-MM-DD] [--commit]");
  process.exit(1);
}

const CLOSE_SA_NAME_COLUMN = "Close SA Name";
const PART_SALE_COLUMN = "Part Sale";
const LABOUR_SALE_COLUMN = "Labour Sale";

const toAmount = (v) => {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};
const normalizeName = (name) => String(name ?? "").replace(/\s+/g, " ").trim().toLowerCase();

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows: staffRows } = await client.query("select name from accessories_staff where branch = $1", [BRANCH]);
  if (staffRows.length === 0) {
    console.error(`No Accessories roster for ${BRANCH} — nothing to match against.`);
    process.exit(1);
  }
  const staffNames = staffRows.map((r) => normalizeName(r.name));
  const isAccessoriesStaff = (closeSaName) => staffNames.includes(normalizeName(closeSaName));
  console.log(`${BRANCH} Accessories roster:`, staffRows.map((r) => r.name).join(", "), "\n");

  const { rows: snapshots } = await client.query(
    // date::text — node-pg parses a `date` column to a local-midnight Date,
    // so .toISOString() would shift it a day back in a +05:30 timezone.
    `select date::text as date, accessories_part_sale, accessories_labour_sale
       from ssrv089_snapshots
      where branch = $1 and variant = $2 and date >= $3
      order by date`,
    [BRANCH, VARIANT, MONTH_START]
  );
  if (snapshots.length === 0) {
    console.log(`No ${VARIANT} SSRV089 snapshots for ${BRANCH} on/after ${MONTH_START}.`);
    process.exit(0);
  }

  const updates = [];
  let mtdPartsNow = 0, mtdPartsFixed = 0, mtdLabourNow = 0, mtdLabourFixed = 0;

  for (const snap of snapshots) {
    const { rows: rawRows } = await client.query(
      "select row_data from raw_upload_rows where report_type = 'ssrv089' and branch = $1 and date = $2 order by row_index",
      [BRANCH, snap.date]
    );

    let parts = 0, labour = 0;
    for (const { row_data } of rawRows) {
      if (!isAccessoriesStaff(row_data[CLOSE_SA_NAME_COLUMN])) continue;
      parts += toAmount(row_data[PART_SALE_COLUMN]);
      labour += toAmount(row_data[LABOUR_SALE_COLUMN]);
    }

    const partsNow = Number(snap.accessories_part_sale);
    const labourNow = Number(snap.accessories_labour_sale);
    mtdPartsNow += partsNow; mtdPartsFixed += parts;
    mtdLabourNow += labourNow; mtdLabourFixed += labour;

    const changed = parts.toFixed(2) !== partsNow.toFixed(2) || labour.toFixed(2) !== labourNow.toFixed(2);
    console.log(
      `${snap.date}  (${rawRows.length} rows)  ` +
        `parts ${partsNow.toFixed(2)} -> ${parts.toFixed(2)}   ` +
        `labour ${labourNow.toFixed(2)} -> ${labour.toFixed(2)}` +
        (changed ? "   *" : "")
    );
    if (changed) updates.push({ date: snap.date, parts, labour });
  }

  console.log("\nAccessories deduction, month-to-date:");
  console.log(`  parts   ${mtdPartsNow.toFixed(2)} -> ${mtdPartsFixed.toFixed(2)}   (Δ ${(mtdPartsFixed - mtdPartsNow).toFixed(2)})`);
  console.log(`  labour  ${mtdLabourNow.toFixed(2)} -> ${mtdLabourFixed.toFixed(2)}   (Δ ${(mtdLabourFixed - mtdLabourNow).toFixed(2)})`);
  console.log("GUS Parts / Labour MTD move down by the same Δ (deduction is subtracted from the KPI total).");
  console.log(`${updates.length} snapshot(s) to update: ${updates.map((u) => u.date).join(", ") || "none"}`);

  if (!COMMIT) {
    console.log("\nDry run — re-run with --commit to apply.");
    process.exit(0);
  }
  if (updates.length === 0) {
    console.log("\nNothing to update.");
    process.exit(0);
  }

  const uploadedAt = new Date().toISOString();
  await client.query("begin");
  for (const u of updates) {
    await client.query(
      `update ssrv089_snapshots
          set accessories_part_sale = $4, accessories_labour_sale = $5, uploaded_at = $6
        where branch = $1 and variant = $2 and date = $3`,
      [BRANCH, VARIANT, u.date, u.parts, u.labour, uploadedAt]
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
