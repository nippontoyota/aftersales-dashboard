// Recompute a branch's Service Info VAS bill revenue from the raw rows
// already on file — for when the /data Accessories roster is corrected (a
// name the DMS spells differently, e.g. "Anoop P M" on the roster vs
// "ANOOP M" in the export) and the stored service_info_snapshots.vas_revenue
// needs to catch up without a re-upload.
//
// VAS bill revenue = sum of priced T-Gloss/Lexus treatment rows, EXCLUDING
// any row whose "Close Service Advisor Name" is on the branch's Accessories
// roster (an accessories staffer's coating sale is an accessories sale, not
// a VAS upsell). The exclusion is applied at parse time, so a later roster
// fix leaves already-stored snapshots stale — this re-derives them with the
// SAME logic as src/lib/service-info/parse.ts and rewrites vas_revenue only.
// Every other column (the four plain counts) is untouched — they don't
// depend on the roster.
//
//   node scripts/recompute-service-info-vas.mjs <BRANCH> [YYYY-MM-DD] [--commit]
//
// <BRANCH>      branch code, e.g. TI01A
// [YYYY-MM-DD]  only recompute snapshots on/after this date (default 2026-09-01)
// --commit      apply; without it, dry run (before/after per day + the MTD effect)
//
// Companion to recompute-ssrv089-accessories.mjs (which does the GUS
// Parts/Labour deduction side of the same roster fix).
import { Client } from "pg";
import "./load-env.mjs";
import { VAS_PRICE_BY_JOB_CODE } from "../src/lib/vas-price-list.ts";
import { seriesToSize } from "../src/lib/vas-series-map.ts";
import { tierForBranch } from "../src/lib/branch-tier.ts";

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");
const positional = args.filter((a) => !a.startsWith("--"));
const BRANCH = positional[0];
const MONTH_START = positional[1] || "2026-09-01";

if (!BRANCH || !/^[A-Z]{2}\d{2}[A-Z]$/.test(BRANCH)) {
  console.error("Usage: node scripts/recompute-service-info-vas.mjs <BRANCH> [YYYY-MM-DD] [--commit]");
  process.exit(1);
}

const JOB_CODE_COLUMN = "Job Code";
const SERIES_COLUMN = "Series";
const CLOSE_SA_NAME_COLUMN = "Close Service Advisor Name";

const normalize = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const normalizeName = (v) => normalize(v).toLowerCase();

/** Mirror of src/lib/service-info/parse.ts vasRevenueForRow. */
function vasRevenueForRow(jobCode, series, tier) {
  if (tier === null) return 0;
  const treatment = VAS_PRICE_BY_JOB_CODE.get(jobCode);
  if (!treatment) return 0;
  const prices = tier === "A" ? treatment.tierA : treatment.tierB;
  const onlyXl = prices.small === null && prices.medium === null && prices.large === null;
  if (onlyXl) return prices.xl ?? 0;
  const size = seriesToSize(series);
  if (size === null) return 0;
  return prices[size] ?? 0;
}

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const tier = tierForBranch(BRANCH);
  console.log(`${BRANCH} city tier: ${tier ?? "(none — every VAS row prices to 0)"}`);

  const { rows: staffRows } = await client.query("select name from accessories_staff where branch = $1", [BRANCH]);
  const staffNames = staffRows.map((r) => normalizeName(r.name));
  console.log(`${BRANCH} Accessories roster: ${staffRows.map((r) => r.name).join(", ") || "(empty)"}\n`);
  const isAccessoriesStaff = (closeSaName) => staffNames.includes(normalizeName(closeSaName));

  const { rows: snapshots } = await client.query(
    `select date::text as date, vas_revenue
       from service_info_snapshots
      where branch = $1 and date >= $2
      order by date`,
    [BRANCH, MONTH_START],
  );
  if (snapshots.length === 0) {
    console.log(`No Service Info snapshots for ${BRANCH} on/after ${MONTH_START}.`);
    process.exit(0);
  }

  const updates = [];
  let mtdNow = 0;
  let mtdFixed = 0;

  for (const snap of snapshots) {
    const { rows: rawRows } = await client.query(
      "select row_data from raw_upload_rows where report_type = 'service_info' and branch = $1 and date = $2 order by row_index",
      [BRANCH, snap.date],
    );

    let vas = 0;
    let excludedRows = 0;
    let excludedValue = 0;
    for (const { row_data } of rawRows) {
      const jobCode = normalize(row_data[JOB_CODE_COLUMN]);
      if (!jobCode) continue;
      const rowValue = vasRevenueForRow(jobCode, normalize(row_data[SERIES_COLUMN]), tier);
      if (isAccessoriesStaff(row_data[CLOSE_SA_NAME_COLUMN])) {
        if (rowValue > 0) {
          excludedRows++;
          excludedValue += rowValue;
        }
        continue;
      }
      vas += rowValue;
    }

    const now = Number(snap.vas_revenue);
    mtdNow += now;
    mtdFixed += vas;
    const changed = vas.toFixed(2) !== now.toFixed(2);
    console.log(
      `${snap.date}  (${rawRows.length} rows)  vas ${now.toFixed(2)} -> ${vas.toFixed(2)}` +
        (excludedRows ? `   [${excludedRows} accessories-staff VAS rows, ₹${excludedValue.toFixed(2)}]` : "") +
        (changed ? "   *" : ""),
    );
    if (changed) updates.push({ date: snap.date, vas });
  }

  console.log(`\nVAS bill revenue, month-to-date (from ${MONTH_START}):`);
  console.log(`  ${mtdNow.toFixed(2)} -> ${mtdFixed.toFixed(2)}   (Δ ${(mtdFixed - mtdNow).toFixed(2)})`);
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
      "update service_info_snapshots set vas_revenue = $3, uploaded_at = $4 where branch = $1 and date = $2",
      [BRANCH, u.date, u.vas, uploadedAt],
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
