// One-off check: confirm every GREY_REVENUE_BRANCHES branch's Grey-brand
// Cost & Sales revenue is folded into GUS/BPU Parts/Labour MTD for 2026-09-30.
//   npx tsx scripts/verify-grey-revenue.mts
import "./load-env.mjs";
import { buildReport } from "../src/lib/report";

const BRANCHES = ["TI01A", "CO01A", "CO01B", "KT01A", "MV01A", "TL01A", "TR01A"];

const report = await buildReport("2026-09-30");
for (const code of BRANCHES) {
  const branch = report?.branches.find((b) => b.branch === code);
  console.log(code, branch && {
    gusPartsMtd: branch.gusPartsMtd,
    gusLabourMtd: branch.gusLabourMtd,
    bpuPartsMtd: branch.bpuPartsMtd,
    bpuLabourMtd: branch.bpuLabourMtd,
  });
}
process.exit(0);
