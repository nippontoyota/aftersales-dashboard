// Re-derive every existing vas_revenue_real row using the new
// cancellation-aware computeVasRevenueReal (2026-10-19 fix — see
// src/lib/vas-revenue-real/compute.ts's cancelledInvoiceDocNos param, added
// after TR01B called in a ₹4,351 TGLOSS discrepancy traced to invoice
// TXE2600459 being cancelled but never excluded from vas_revenue_real).
//
// Dry-run by default — prints the per-branch MTD delta this fix produces.
// Pass --commit to actually overwrite vas_revenue_real with the corrected
// values.
//
//   npx tsx scripts/recompute-vas-revenue-real-cancellations.mts [--commit]
import "./load-env.mjs";
import { pool } from "../src/lib/db";
import { listAccessoriesStaffNamesForBranch } from "../src/lib/accessories-staff-store";
import { loadServiceInfoSnapshot } from "../src/lib/service-info/store";
import { loadServiceInfoBpSnapshot } from "../src/lib/service-info-bp/store";
import { computeVasRevenueReal, loadCancelledInvoiceDocNosForBranch } from "../src/lib/vas-revenue-real/compute";
import { saveVasRevenueReal } from "../src/lib/vas-revenue-real/store";

const COMMIT = process.argv.includes("--commit");

const { rows: existing } = await pool.query<{ date: string; branch: string; vas_revenue: string; cancelled_rows: number }>(
  `select date::text as date, branch, vas_revenue, cancelled_rows from vas_revenue_real order by branch, date`
);

type Delta = { branch: string; date: string; oldRevenue: number; newRevenue: number; cancelledRows: number };
const deltas: Delta[] = [];
const cancelledDocNosCache = new Map<string, Set<string>>();

for (const row of existing) {
  const branch = row.branch;
  if (!cancelledDocNosCache.has(branch)) {
    cancelledDocNosCache.set(branch, await loadCancelledInvoiceDocNosForBranch(branch));
  }
  const cancelledInvoiceDocNos = cancelledDocNosCache.get(branch)!;

  const [staffNames, gsSnapshot, bpSnapshot] = await Promise.all([
    listAccessoriesStaffNamesForBranch(branch),
    loadServiceInfoSnapshot(row.date, branch),
    loadServiceInfoBpSnapshot(row.date, branch),
  ]);
  const gsAggregateVasRevenue = gsSnapshot?.counts.vasRevenue ?? 0;
  const bpAggregateVasRevenue = bpSnapshot?.counts.vasRevenue ?? 0;

  const result = await computeVasRevenueReal(branch, row.date, staffNames, gsAggregateVasRevenue, bpAggregateVasRevenue, cancelledInvoiceDocNos);

  const oldRevenue = Number(row.vas_revenue);
  if (result.vasRevenue !== oldRevenue || result.cancelledRows !== row.cancelled_rows) {
    deltas.push({ branch, date: row.date, oldRevenue, newRevenue: result.vasRevenue, cancelledRows: result.cancelledRows });
  }
  if (COMMIT) {
    await saveVasRevenueReal({ date: row.date, branch, ...result });
  }
}

console.log(COMMIT ? "=== COMMITTED — vas_revenue_real updated ===" : "=== DRY RUN — no writes made (pass --commit to apply) ===");
console.log(`${deltas.length} day-rows changed across ${new Set(deltas.map((d) => d.branch)).size} branch(es).\n`);

const byBranch = new Map<string, Delta[]>();
for (const d of deltas) {
  if (!byBranch.has(d.branch)) byBranch.set(d.branch, []);
  byBranch.get(d.branch)!.push(d);
}

let grandOld = 0;
let grandNew = 0;
for (const [branch, rows] of [...byBranch.entries()].sort()) {
  const branchOld = rows.reduce((s, r) => s + r.oldRevenue, 0);
  const branchNew = rows.reduce((s, r) => s + r.newRevenue, 0);
  grandOld += branchOld;
  grandNew += branchNew;
  console.log(`${branch}: MTD ₹${branchOld.toFixed(0)} -> ₹${branchNew.toFixed(0)}  (Δ ₹${(branchNew - branchOld).toFixed(0)})`);
  for (const r of rows) {
    console.log(`    ${r.date}: ₹${r.oldRevenue.toFixed(0)} -> ₹${r.newRevenue.toFixed(0)}  (cancelledRows=${r.cancelledRows})`);
  }
}
console.log(`\nTotal across changed branches: ₹${grandOld.toFixed(0)} -> ₹${grandNew.toFixed(0)}  (Δ ₹${(grandNew - grandOld).toFixed(0)})`);

await pool.end();
