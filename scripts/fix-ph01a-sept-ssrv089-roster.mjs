// One-off data correction (2026-09-08): PH01A's Accessories roster listed
// "Santhosh V M", but every SSRV089 row in the DMS export names him
// "Santhosh M" (no "V"). The names never matched, so his September
// Accessories sales were never subtracted — leaving ~₹21,893 of parts
// (and ~₹37 of labour) sitting inside PH01A's GUS Parts / GUS Labour MTD.
// The 3 Sep snapshot in particular read 0/0 because that day was
// Santhosh-only.
//
// The roster row has already been corrected to "Santhosh M" (accessories_staff
// id 31). This re-derives Accessories Part/Labour Sale for every PH01A
// September SSRV089-General snapshot from the raw rows already on file —
// same match logic as src/lib/ssrv089/parse.ts — and rewrites the two
// accessories_* columns. Raw rows are untouched (they were always correct;
// only the name match was wrong).
//
//   node scripts/fix-ph01a-sept-ssrv089-roster.mjs [--commit]
//
// Dry run by default: prints before/after per day and the MTD effect.
import { Client } from "pg";
import "./load-env.mjs";

const COMMIT = process.argv.includes("--commit");

const BRANCH = "PH01A";
const VARIANT = "general";
const MONTH_START = "2026-09-01";

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
  const staffNames = staffRows.map((r) => normalizeName(r.name));
  const isAccessoriesStaff = (closeSaName) => staffNames.includes(normalizeName(closeSaName));
  console.log(`${BRANCH} Accessories roster:`, staffRows.map((r) => r.name).join(", "), "\n");

  const { rows: snapshots } = await client.query(
    // date::text — node-pg parses a `date` column to a local-midnight Date,
    // so .toISOString() would shift it a day back in a +05:30 timezone.
    `select date::text as date, uploaded_at, source_file_name, accessories_part_sale, accessories_labour_sale
       from ssrv089_snapshots
      where branch = $1 and variant = $2 and date >= $3
      order by date`,
    [BRANCH, VARIANT, MONTH_START]
  );

  const updates = [];
  let mtdPartsNow = 0, mtdPartsFixed = 0, mtdLabourNow = 0, mtdLabourFixed = 0;

  for (const snap of snapshots) {
    const date = snap.date;
    const { rows: rawRows } = await client.query(
      "select row_data from raw_upload_rows where report_type = 'ssrv089' and branch = $1 and date = $2 order by row_index",
      [BRANCH, date]
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
      `${date}  (${rawRows.length} rows)  ` +
        `parts ${partsNow.toFixed(2)} -> ${parts.toFixed(2)}   ` +
        `labour ${labourNow.toFixed(2)} -> ${labour.toFixed(2)}` +
        (changed ? "   *" : "")
    );
    if (changed) updates.push({ date, parts, labour });
  }

  console.log("\nAccessories deduction, month-to-date:");
  console.log(`  parts   ${mtdPartsNow.toFixed(2)} -> ${mtdPartsFixed.toFixed(2)}   (Δ ${(mtdPartsFixed - mtdPartsNow).toFixed(2)})`);
  console.log(`  labour  ${mtdLabourNow.toFixed(2)} -> ${mtdLabourFixed.toFixed(2)}   (Δ ${(mtdLabourFixed - mtdLabourNow).toFixed(2)})`);
  console.log("\nGUS Parts / Labour MTD move down by the same Δ (deduction is subtracted from the KPI total).");
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
