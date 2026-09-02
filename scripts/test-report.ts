import './load-env.mjs';
import { buildReport } from '../src/lib/report.ts';

(async () => {
  const r = await buildReport("2026-09-01");
  console.log("Branch:", r.branches[0].branch);
  console.log("RO billed today (gus):", r.branches[0].gusRoBilledForTheDay);
  console.log("RO MTD (gus):", r.branches[0].gusRoMtd);
  process.exit(0);
})();
