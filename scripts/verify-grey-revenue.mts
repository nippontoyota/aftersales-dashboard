// One-off check: confirm TI01A's Grey-brand Cost & Sales revenue is now
// folded into GUS/BPU Parts/Labour MTD for 2026-09-30.
//   npx tsx scripts/verify-grey-revenue.mts
import "./load-env.mjs";
import { buildReport } from "../src/lib/report";

const report = await buildReport("2026-09-30");
const branch = report?.branches.find((b) => b.branch === "TI01A");
console.log(branch && {
  gusPartsMtd: branch.gusPartsMtd,
  gusLabourMtd: branch.gusLabourMtd,
  bpuPartsMtd: branch.bpuPartsMtd,
  bpuLabourMtd: branch.bpuLabourMtd,
});
process.exit(0);
