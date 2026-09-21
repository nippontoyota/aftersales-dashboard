// One-time fix: TI01B's 2026-09-15 Service Info upload re-included 314 ROs
// already uploaded on 09-09/09-10/09-12/09-13 (94% overlap, 821 of 884
// rows) — a partial re-upload that Part 2's RO-overlap check (added
// 2026-09-19) would now catch before it happens again. This removes the
// duplicate raw rows and corrects the 2026-09-15 snapshot to the true,
// deduplicated counts (verified against real data, including the
// Accessories-staff exclusion service-info/parse.ts applies, before
// writing anything — see conversation this shipped from).
//
// Dry-run by default; pass --commit to write.
import { Client } from "pg";
import "./load-env.mjs";
import { VAS_PRICE_BY_JOB_CODE } from "../src/lib/vas-price-list.ts";
import { seriesToSize } from "../src/lib/vas-series-map.ts";
import { tierForBranch } from "../src/lib/branch-tier.ts";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "TI01B";
const DATE = "2026-09-15";

const normalize = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const normalizeName = (v) => normalize(v).toLowerCase();
const WHEEL_BALANCING_DESC = "WB (OFF-VEHICLE, TWO WHEELS) - ADJST";
const WHEEL_ALIGNMENT_DESC = "WHEEL ALIGNMENT - INSP";
const EVAPORATOR_CLEANING_DESC = "TGLOSS Air Fresh-Front Evaporator";
function isBrakeSkimmingDesc(desc) { return /(?:FR|RR) DISC \(ONE SIDE\) \((?:ON|OFF)-VEHICLE\).*GRIND/i.test(desc); }
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
  const staffRes = await client.query("select name from accessories_staff where branch=$1", [BRANCH]);
  const staffNames = staffRes.rows.map((r) => normalizeName(r.name));

  const dupeRos = await client.query(
    `with dated as (
       select date, row_data->>'Job Order No' as ro
       from raw_upload_rows
       where report_type='service_info' and branch=$1 and date >= '2026-09-01'
         and coalesce(trim(row_data->>'Job Order No'),'') <> ''
       group by date, row_data->>'Job Order No'
     )
     select ro from dated where date=$2
       and exists (select 1 from dated d2 where d2.ro = dated.ro and d2.date < $2)`,
    [BRANCH, DATE]
  );
  const dupeSet = new Set(dupeRos.rows.map((r) => r.ro));
  console.log(`Duplicate ROs on ${DATE}: ${dupeSet.size}`);

  const rowsRes = await client.query(
    "select id, row_data from raw_upload_rows where report_type='service_info' and branch=$1 and date=$2 order by row_index",
    [BRANCH, DATE]
  );

  const idsToDelete = [];
  let counts = { wheelBalancing: 0, wheelAlignment: 0, evaporatorCleaning: 0, vasRevenue: 0 };
  const brakeSkimmingRos = new Set();

  for (const { id, row_data } of rowsRes.rows) {
    const ro = normalize(row_data["Job Order No"]);
    if (dupeSet.has(ro)) {
      idsToDelete.push(id);
      continue;
    }
    const desc = normalize(row_data["Job Desc"]);
    if (desc === WHEEL_BALANCING_DESC) counts.wheelBalancing++;
    else if (desc === WHEEL_ALIGNMENT_DESC) counts.wheelAlignment++;
    else if (isBrakeSkimmingDesc(desc)) brakeSkimmingRos.add(ro || `row-${id}`);
    else if (desc === EVAPORATOR_CLEANING_DESC) counts.evaporatorCleaning++;

    const jobCode = normalize(row_data["Job Code"]);
    const closeSa = normalize(row_data["Close Service Advisor Name"]);
    if (jobCode && !staffNames.includes(normalizeName(closeSa))) {
      counts.vasRevenue += vasRevenueForRow(jobCode, normalize(row_data["Series"]), tier);
    }
  }
  const brakeSkimming = brakeSkimmingRos.size;

  const current = await client.query(
    "select wheel_balancing, wheel_alignment, brake_skimming, evaporator_cleaning, vas_revenue from service_info_snapshots where branch=$1 and date=$2",
    [BRANCH, DATE]
  );
  console.log("\nCurrent snapshot:", current.rows[0]);
  console.log("Corrected snapshot:", {
    wheel_balancing: counts.wheelBalancing,
    wheel_alignment: counts.wheelAlignment,
    brake_skimming: brakeSkimming,
    evaporator_cleaning: counts.evaporatorCleaning,
    vas_revenue: counts.vasRevenue.toFixed(2),
  });
  console.log(`\nRaw rows to delete: ${idsToDelete.length} of ${rowsRes.rows.length}`);

  if (!COMMIT) {
    console.log("\nDry run — re-run with --commit to apply.");
    process.exit(0);
  }

  await client.query("begin");
  await client.query("delete from raw_upload_rows where id = any($1::bigint[])", [idsToDelete]);
  await client.query(
    `update service_info_snapshots
        set wheel_balancing = $3, wheel_alignment = $4, brake_skimming = $5, evaporator_cleaning = $6, vas_revenue = $7, uploaded_at = $8
      where branch = $1 and date = $2`,
    [BRANCH, DATE, counts.wheelBalancing, counts.wheelAlignment, brakeSkimming, counts.evaporatorCleaning, counts.vasRevenue, new Date().toISOString()]
  );
  await client.query("commit");
  console.log(`\nCommitted. Deleted ${idsToDelete.length} raw rows, corrected the ${DATE} snapshot.`);
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}
