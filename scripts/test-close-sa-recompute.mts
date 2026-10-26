// One-off smoke test: recompute Close SA Analytics for a branch/date known
// to have service_info + labour_sales + part_sale rows, then print the
// result — sanity check before wiring this into the UI.
import "./load-env.mjs";
import { recomputeCloseSaAnalytics } from "../src/lib/close-sa-analytics/recompute";
import { loadCloseSaAnalyticsForBranch } from "../src/lib/close-sa-analytics/store";
import { pool } from "../src/lib/db";

const branch = process.argv[2] ?? "CO01A";
const date = process.argv[3] ?? "2026-10-20";

console.log(`Recomputing ${branch} / ${date}...`);
await recomputeCloseSaAnalytics(branch, date);

const rows = await loadCloseSaAnalyticsForBranch(branch, date, date);
console.log(`${rows.length} Close SA rows for ${branch}/${date}:\n`);
for (const r of rows) {
  console.log(
    `${r.closeSaName.padEnd(25)} ROs=${r.roCount} vehicles=${r.vehicleVins.length} ` +
      `jobDescTotal=${Object.values(r.jobDescCounts).reduce((a, b) => a + b, 0)} ` +
      `VAS(wb=${r.wheelBalancingCount},wa=${r.wheelAlignmentCount},bs=${r.brakeSkimmingCount},ev=${r.evaporatorCleaningCount}) ` +
      `vasRev=${r.vasBillRevenue.toFixed(0)} labourAfter=${r.labourRevenueAfter.toFixed(0)} soldHours=${r.soldHours.toFixed(2)} ` +
      `overTarget=${r.overTargetTotal.toFixed(2)} partsRev=${r.partsRevenue.toFixed(0)} partsMatchedRos=${r.partsMatchedRoCount} ` +
      `amc=${r.amcCount} fmsc=${r.fmscCount} em=${r.emCount} em60=${r.em60Count} em60OTD=${r.em60OnTimeCount} bpPotential=${r.bpPotentialCount} appt=${r.appointmentCount} walkin=${r.walkinCount} ` +
      `tyre=${r.tyreCount} battery=${r.batteryCount}`,
  );
  console.log(`   jobType=${JSON.stringify(r.jobTypeCounts)} payType=${JSON.stringify(r.payTypeCounts)}`);
  console.log(`   top job descs: ${Object.entries(r.jobDescCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}=${v}`).join(", ")}`);
}

await pool.end();
