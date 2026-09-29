/**
 * Tests for the paired-branch externalSalesPctOfSprInternal calculation.
 *
 * Rule: a branch contributes to the ratio only when BOTH externalSalesMtd AND
 * partsRetailAchievementForTheMonth are numeric. A branch missing either field
 * is excluded from both numerator and denominator — it never biases the result.
 * Zero is a valid number. Returns null when no branch has both inputs.
 *
 * Run: npx tsx test-external-sales-pct.ts
 */
import { computeKpiSummary, computeHeroSummary } from "./src/lib/aggregate.ts";
import type { BranchReport } from "./src/lib/report.ts";

function b(externalSalesMtd: number | null, partsRetailAchievementForTheMonth: number | null): BranchReport {
  return {
    externalSalesMtd,
    partsRetailAchievementForTheMonth,
    branch: "TEST", date: "2026-09-29",
    gusRoBilledForTheDay: null, gusRoMtd: null,
    bpuRoBilledForTheDay: null, bpuRoMtd: null,
    cpuAchievementForTheMonth: null,
    offtakeAchievementForTheMonth: null, offtakeTarget: null,
    partsRetailTarget: null,
    bpuAchievementForTheMonth: null, bpuTarget: null,
    pmOcAchievementForTheMonth: null, pmOcTarget: null,
    vasBillTarget: null, vasAchievementForTheMonth: null,
    penetrationTGlossService: null,
    wheelBalancingForTheDay: null, wheelBalancingMtd: null,
    wheelAlignmentForTheDay: null, wheelAlignmentMtd: null,
    brakeSkimmingForTheDay: null, brakeSkimmingMtd: null,
    evaporatorCleaningForTheDay: null, evaporatorCleaningMtd: null,
    engineFlushForTheDay: null, engineFlushMtd: null,
    injectorCleanerForTheDay: null, injectorCleanerMtd: null,
    syntheticOilForTheDay: null, syntheticOilMtd: null,
    brakeCleaningSprayForTheDay: null, brakeCleaningSprayMtd: null,
    diyCountForTheDay: null, diyCountMtd: null,
    diyRevenueForTheDay: null, diyRevenueMtd: null,
    gusPartsMtd: null, gusLabourMtd: null,
    bpuPartsMtd: null, bpuLabourMtd: null,
    stockMonthTgp: null, srLinesTotalPct: null,
    sprExternalMtd: null,
    scrapRevenueForTheDay: 0, scrapRevenueMtd: 0,
    usedOilRevenueForTheDay: 0, usedOilRevenueMtd: 0,
    totalRevenueStreamMtd: null,
    externalSalesPctOfSprInternal: null,
    partsProfitMtd: null, labourProfitMtd: null, tglossMarginMtd: null, profitMtd: null,
    gsGrossProfitPerRoMtd: null, bpGrossProfitPerRoMtd: null,
    spoTGloss: null, spoTGlossTarget: null,
    serviceRevenue: null, serviceUnits: null,
    batterySalesForTheMonth: null, tireSalesForTheMonth: null,
    batteryTarget: null, tireTarget: null,
  } as unknown as BranchReport;
}

let passed = 0;
let failed = 0;

function approxEq(a: number | null, b: number | null, tol = 1e-9): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(a - b) < tol;
}

function test(name: string, actual: number | null, expected: number | null) {
  const ok = approxEq(actual, expected);
  if (ok) {
    console.log(`PASS  ${name}`);
    passed++;
  } else {
    console.error(`FAIL  ${name}: got ${actual}, expected ${expected}`);
    failed++;
  }
}

// ── Case 1: three branches of unequal size ────────────────────────────────────
// All three have both fields → all three contribute.
// CO01A: ext=10L, sprI=90L;  KL01A: ext=5L, sprI=45L;  TR01B: ext=5L, sprI=5L
// sumExt=20L, sumSprI=140L → 20/160 = 12.5%
// (old avgField would have given (10%+10%+50%)/3 = 23.3% — wrong)
const threeBranch = [b(10_00_000, 90_00_000), b(5_00_000, 45_00_000), b(5_00_000, 5_00_000)];
test("KpiSummary  — three branches, all paired → 12.5%",  computeKpiSummary(threeBranch).externalSalesPctOfSprInternal,  0.125);
test("HeroSummary — three branches, all paired → 12.5%",  computeHeroSummary(threeBranch).externalSalesPctOfSprInternal, 0.125);

// ── Case 2: single branch ─────────────────────────────────────────────────────
// ext=10L, sprI=90L → 10/100 = 10%
const oneBranch = [b(10_00_000, 90_00_000)];
test("KpiSummary  — single branch → 10%",    computeKpiSummary(oneBranch).externalSalesPctOfSprInternal,    0.1);
test("HeroSummary — single branch → 10%",    computeHeroSummary(oneBranch).externalSalesPctOfSprInternal,   0.1);

// ── Case 3: zero denominator ─────────────────────────────────────────────────
// Both present but both zero → denom = 0+0 = 0 → null
const zeroDenom = [b(0, 0)];
test("KpiSummary  — zero denom (0/0) → null", computeKpiSummary(zeroDenom).externalSalesPctOfSprInternal,   null);
test("HeroSummary — zero denom (0/0) → null", computeHeroSummary(zeroDenom).externalSalesPctOfSprInternal,  null);

// ── Case 4: all-null inputs → null ───────────────────────────────────────────
// No branch has both fields → no contribution → null
const allNull = [b(null, null), b(null, null)];
test("KpiSummary  — all null → null",         computeKpiSummary(allNull).externalSalesPctOfSprInternal,      null);
test("HeroSummary — all null → null",         computeHeroSummary(allNull).externalSalesPctOfSprInternal,     null);

// ── Case 5: SPR-I missing on one branch (ext present, sprI=null) ─────────────
// Branch A: ext=10L, sprI=90L  (paired — contributes)
// Branch B: ext=5L,  sprI=null (Part Sale uploaded but BA Tool not yet — EXCLUDED)
// Result: uses branch A only → 10/(90+10) = 10%
// (previous sumField approach would have given 15/105 = 14.28% — incorrect)
const sprIMissing = [b(10_00_000, 90_00_000), b(5_00_000, null)];
test("KpiSummary  — sprI null on one branch → excluded, result = 10%",
  computeKpiSummary(sprIMissing).externalSalesPctOfSprInternal, 0.1);

// ── Case 6: external sales missing on one branch (ext=null, sprI present) ────
// Branch A: ext=null, sprI=90L (BA Tool uploaded but Part Sale not yet — EXCLUDED)
// Branch B: ext=5L,   sprI=45L (both present — contributes)
// Result: uses branch B only → 5/(45+5) = 5/50 = 10%
const extMissing = [b(null, 90_00_000), b(5_00_000, 45_00_000)];
test("KpiSummary  — external null on one branch → excluded, result = 10%",
  computeKpiSummary(extMissing).externalSalesPctOfSprInternal, 0.1);

// ── Case 7: zero external sales is a valid number, not missing ───────────────
// Branch A: ext=0, sprI=50L (no external sales that day — contributes 0 to numerator)
// Branch B: ext=5L, sprI=45L
// sumExt=5L, sumSprI=95L → 5/100 = 5%
// Contrast: if ext=0 were treated as null, only branch B would contribute → 5/50 = 10%
const zeroExt = [b(0, 50_00_000), b(5_00_000, 45_00_000)];
test("KpiSummary  — ext=0 treated as valid → 5% (not 10%)",
  computeKpiSummary(zeroExt).externalSalesPctOfSprInternal, 5_00_000 / (95_00_000 + 5_00_000));

// ── Case 8: all inputs missing on all branches → null ────────────────────────
// Extreme: every branch has null for one or both fields
const noComplete = [b(10_00_000, null), b(null, 90_00_000), b(null, null)];
test("KpiSummary  — no branch has both → null",
  computeKpiSummary(noComplete).externalSalesPctOfSprInternal, null);

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exitCode = 1;
