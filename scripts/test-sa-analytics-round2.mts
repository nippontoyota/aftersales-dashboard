import "./load-env.mjs";
import { classifySaCategory, aggregateCloseSaRows, mergeRepeatJobCounts } from "../src/lib/close-sa-analytics/aggregate";
import { recomputeCloseSaAnalytics } from "../src/lib/close-sa-analytics/recompute";
import { findRepeatJobs, repeatJobCountsBySa } from "../src/lib/close-sa-analytics/repeat-jobs";
import { loadCloseSaAnalyticsForBranch } from "../src/lib/close-sa-analytics/store";
import { listAccessoriesStaffNamesForBranch } from "../src/lib/accessories-staff-store";
import { pool } from "../src/lib/db";

const branch = "CO01A";
const dates = ["2026-10-20", "2026-10-21", "2026-10-22"];
for (const d of dates) await recomputeCloseSaAnalytics(branch, d);

const rows = await loadCloseSaAnalyticsForBranch(branch, "2026-10-20", "2026-10-22");
const totals = aggregateCloseSaRows(rows);

const flags = await findRepeatJobs(branch, "2026-10-20", "2026-10-22");
mergeRepeatJobCounts(totals, repeatJobCountsBySa(flags));

const accessoriesStaff = await listAccessoriesStaffNamesForBranch(branch);

console.log(`${totals.length} SAs, ${branch} 2026-10-20..22\n`);
let gs = 0, bp = 0, acc = 0, pdi = 0;
for (const t of totals) {
  const cat = classifySaCategory(t, accessoriesStaff);
  if (cat === "GS") gs++; else if (cat === "BP") bp++; else if (cat === "Accessories") acc++; else pdi++;
  if (t.mechCareCount > 0 || t.brakeCleaningLabourCount > 0 || t.pmRoCount > 0 || t.bpRoCount > 0 || t.repeatJobCount > 0) {
    console.log(
      `${t.closeSaName.padEnd(20)} cat=${cat.padEnd(11)} mechCare=${t.mechCareCount} brakeCleanLabour=${t.brakeCleaningLabourCount} ` +
      `pmRo=${t.pmRoCount} tglossPitched=${t.tglossPitchedRoCount} sdd=${t.sameDayDeliveryCount}/${t.roCount} ` +
      `bpRo=${t.bpRoCount} bpLabour=${t.bpLabourRevenue} bpParts=${t.bpPartsRevenue} bpTgloss=${t.bpTglossRevenue} ` +
      `bpRepType=${JSON.stringify(t.bpRepairTypeCounts)} repeat=${t.repeatJobCount}`,
    );
  }
}
console.log(`\nCategory counts: GS=${gs} BP=${bp} Accessories=${acc} PDI=${pdi}`);

await pool.end();
