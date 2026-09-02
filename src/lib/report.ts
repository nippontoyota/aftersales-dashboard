import type { BaToolBranchRow } from "./ba-tool/parse";
import { loadSnapshot, loadPreviousSnapshot } from "./snapshot-store";
import { loadAllServiceInfoSnapshotsForDate, loadAllServiceInfoSnapshotsForMonthUpTo } from "./service-info/store";
import type { ServiceInfoSnapshot } from "./service-info/store";
import { loadAllPartSaleSnapshotsForDate, loadAllPartSaleSnapshotsForMonthUpTo } from "./part-sale/store";
import type { PartSaleSnapshot } from "./part-sale/store";
import { loadAllSsrv089SnapshotsForMonthUpTo } from "./ssrv089/store";
import type { Ssrv089Snapshot } from "./ssrv089/store";
import { loadAllScom205SnapshotsForDate } from "./scom205/store";
import type { Scom205Snapshot } from "./scom205/store";
import { loadBillRevenueByBranchForMonth } from "./bill/store";

const FIXED_TGLOSS_SERVICE_TARGET = 0.38;

// VAS Bill Target = GUS RO MTD × 38% × Rs 3,000 — fixed constants across
// every branch and tier (confirmed with the user 2026-08-31; the 38% here
// is a separate, coincidentally-identical constant from
// FIXED_TGLOSS_SERVICE_TARGET above, which grades a different BA Tool field).
const VAS_BILL_TARGET_RO_SHARE = 0.38;
const VAS_BILL_TARGET_PER_RO = 3000;

export type BranchReport = {
  branch: string;

  gusRoBilledForTheDay: number | null;
  gusRoMtd: number | null;

  bpuRoBilledForTheDay: number | null;
  bpuRoMtd: number | null;

  tireTarget: number | null;
  tireSales: number | null;
  tireSalesForTheMonth: number | null;

  batteryTarget: number | null;
  batterySales: number | null;
  batterySalesForTheMonth: number | null;

  targetTGlossService: number;
  penetrationTGlossService: number | null;
  tGlossSpo: number | null;

  cpuForTheDay: number | null;
  cpuAchievementForTheMonth: number | null;

  bpuTarget: number | null;
  bpuForTheDay: number | null;
  bpuAchievementForTheMonth: number | null;

  offtakeTarget: number | null;
  offtakeForThePreviousDay: number | null;
  offtakeAchievementForTheMonth: number | null;

  /** Present only on a branch that absorbed an online-store code (CO01A
   * absorbing CO01C) — the physical-vs-online Offtake split, for an
   * "expand" view that wants to show both without recomputing anything. */
  onlineStoreBreakdown?: OnlineStoreBreakdown;

  partsRetailTarget: number | null;
  partsRetailForTheDay: number | null;
  partsRetailAchievementForTheMonth: number | null;

  pmOcTarget: number | null;
  pmOcForTheDay: number | null;
  pmOcAchievementForTheMonth: number | null;

  // VAS Bill (T-Gloss/Lexus revenue) — Target = GUS RO MTD × 38% × Rs 3,000
  // (see VAS_BILL_TARGET_RO_SHARE/PER_RO above); Achievement = Service
  // Info Report TGLOSS+LEXUS rows matched against the price list (see
  // service-info/parse.ts), same sum-of-daily-uploads MTD convention as
  // every other Service Info field. Confirmed with the user 2026-08-31.
  vasBillTarget: number | null;
  vasAchievementForTheDay: number | null;
  vasAchievementForTheMonth: number | null;
  /** Achievement / Target. */
  vasAchievementPercent: number | null;
  /** "VAS Gentani" (user's own term) — Achievement / GUS RO MTD, i.e. average VAS revenue per GUS repair order. Not a target-graded ratio. */
  vasGentani: number | null;

  // Value-added services from Service Info Report — same "today's direct
  // count, MTD is the running sum" pattern as Tyre/Battery above.
  wheelBalancingForTheDay: number | null;
  wheelBalancingMtd: number | null;
  wheelAlignmentForTheDay: number | null;
  wheelAlignmentMtd: number | null;
  brakeSkimmingForTheDay: number | null;
  brakeSkimmingMtd: number | null;
  evaporatorCleaningForTheDay: number | null;
  evaporatorCleaningMtd: number | null;

  // Value-added services from Part Sale Report — same pattern.
  engineFlushForTheDay: number | null;
  engineFlushMtd: number | null;
  injectorCleanerForTheDay: number | null;
  injectorCleanerMtd: number | null;
  syntheticOilForTheDay: number | null; // litres
  syntheticOilMtd: number | null; // litres
  brakeCleaningSprayForTheDay: number | null;
  brakeCleaningSprayMtd: number | null;
  /** Informational breakdown, not carved out of externalSalesMtd — DIY rows also legitimately count there too (confirmed with the user 2026-08-31). */
  diyCountForTheDay: number | null;
  diyCountMtd: number | null;
  diyRevenueForTheDay: number | null;
  diyRevenueMtd: number | null;

  // GUS/BPU Parts & Labour MTD (Rs) — scom205's cumulative revenue rows,
  // GUS additionally netted against the branch's cumulative Accessories
  // sales from SSRV089 (General variant only). MTD-only, no daily figure —
  // that's how the user defined these. Null whenever scom205 hasn't been
  // uploaded for this branch/date yet.
  gusPartsMtd: number | null;
  gusLabourMtd: number | null;
  bpuPartsMtd: number | null;
  bpuLabourMtd: number | null;

  // External Sales MTD (Rs) = BA Tool's SPR External (already cumulative)
  // plus the branch's cumulative Part Sale Report "External Sales" filter
  // (AA-billed rows, PartNo prefix match — see part-sale/parse.ts). Null
  // whenever Part Sale Report hasn't been uploaded for this branch this
  // month, same conservative rule as GUS Parts MTD above.
  externalSalesMtd: number | null;

  // Scrap and used-oil revenue (Rs, without tax) — sum of PDF bill taxable
  // values for this branch in the report's calendar month, split by the
  // category chosen on upload. Always a number (0 when no bills), never
  // null: bills are optional and their absence means zero, not "unknown".
  // Attributed to the branch that uploaded the bill; counted by upload
  // timestamp month, so a published month's figure keeps moving as more
  // bills come in (2026-09-02, at the user's request).
  scrapRevenueMtd: number;
  usedOilRevenueMtd: number;

  // From the user's real "Revenue Stream" reference sheet — verified against
  // its embedded formulas directly, not re-derived by us:
  //   Total MTD (Rs)  = GUS Parts + GUS Labour + BPU Parts + BPU Labour + External Sales
  //   % on SPR I       = External Sales / (Parts Retail Achievement MTD [SPR Internal] + External Sales)
  // % on SPR I is null unless every input it depends on is present. Total MTD
  // is null unless the five BA-Tool inputs are present; scrap + used-oil bill
  // revenue is then added on top (0 when absent) but never on its own
  // resurrects a null total.
  totalRevenueStreamMtd: number | null;
  externalSalesPctOfSprInternal: number | null;
};

export type Report = {
  date: string;
  /** ISO timestamp the BA Tool file for `date` was uploaded — for a "data as of" footer, not a business figure. */
  uploadedAt: string;
  hasPreviousSnapshot: boolean;
  previousDate: string | null;
  /** Calendar days between `date` and `previousDate` — 1 on a normal day,
   * >1 after a skipped/holiday upload. Every "for the day" figure in this
   * report spans this many days, not necessarily one; null means there was
   * no previous upload at all to compare against. */
  daysSincePrevious: number | null;
  branches: BranchReport[];
};

function daysBetween(laterIsoDate: string, earlierIsoDate: string): number {
  const later = new Date(`${laterIsoDate}T00:00:00Z`).getTime();
  const earlier = new Date(`${earlierIsoDate}T00:00:00Z`).getTime();
  return Math.round((later - earlier) / (1000 * 60 * 60 * 24));
}

function num(value: number | string | null | undefined): number | null {
  return typeof value === "number" ? value : null;
}

function delta(today: number | null, yesterday: number | null): number | null {
  if (today === null) return null;
  if (yesterday === null) return today; // first-ever snapshot: no prior day to diff against
  return today - yesterday;
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

/** Sums a numeric field across a branch's snapshots for one source (Service Info/Part Sale/SSRV089) — null (not 0) when the branch never uploaded that source this month, so "no data" stays distinguishable from "uploaded zero." */
function sumBy<T>(snapshots: T[], get: (s: T) => number): number | null {
  if (snapshots.length === 0) return null;
  return snapshots.reduce((total, s) => total + get(s), 0);
}

/** Branch codes that stay fully accepted on upload and stored in the
 * database exactly as before, but are deliberately excluded from every
 * dashboard view and every aggregate/region total — not merged into
 * anything (unlike CO01C → CO01A below), just switched off. CO01D is a
 * Lexus code this dashboard doesn't track. A branch listed here should also
 * be removed from its region in regions.ts, so it doesn't silently count
 * toward a region/company trend total either. */
const DEACTIVATED_BRANCHES = new Set<string>(["CO01D"]);

function excludeDeactivatedBranches(rows: BaToolBranchRow[]): BaToolBranchRow[] {
  return rows.filter((row) => !DEACTIVATED_BRANCHES.has(row.branch));
}

/** Branch codes that aren't real physical branches — their BA Tool row folds
 * into a parent branch's row and the code itself never appears downstream
 * as its own branch. CO01C is Nippon Toyota's online-store sales channel;
 * its row only carries real SPR External / SPO Dealer figures (everything
 * else in it is empty), so only those fields get merged in. Splitting the
 * parent and online figures back apart for an "expand" view is separate,
 * later work — this only handles the merge. */
const ONLINE_STORE_PARENT_BRANCH: Record<string, string> = {
  CO01C: "CO01A",
};

const ONLINE_STORE_MERGED_FIELDS: Exclude<keyof BaToolBranchRow, "branch">[] = ["sprExternal", "spoDealer", "spoDealerTarget"];

/** The parent branch's own (physical-store-only) Offtake next to the online
 * store's, so a view that needs to un-merge CO01C back out of CO01A — an
 * "expand" toggle — can show both without recomputing anything. Only
 * Offtake is captured here; External Sales gets the same treatment once a
 * view actually needs it (see report-table.tsx / hero-kpi.tsx TODOs when we
 * get there). */
export type OnlineStoreBreakdown = {
  onlineBranchCode: string;
  ownOfftake: number | null;
  ownOfftakeTarget: number | null;
  onlineOfftake: number | null;
  onlineOfftakeTarget: number | null;
};

function mergeOnlineStoreBranches(rows: BaToolBranchRow[]): { rows: BaToolBranchRow[]; breakdowns: Map<string, OnlineStoreBreakdown> } {
  const originalByBranch = new Map(rows.map((row) => [row.branch, row]));
  const merged = rows.map((row) => ({ ...row }));
  const mergedByBranch = new Map(merged.map((row) => [row.branch, row]));
  const breakdowns = new Map<string, OnlineStoreBreakdown>();

  for (const [onlineCode, parentCode] of Object.entries(ONLINE_STORE_PARENT_BRANCH)) {
    const online = originalByBranch.get(onlineCode);
    const originalParent = originalByBranch.get(parentCode);
    const parent = mergedByBranch.get(parentCode);
    if (!online || !originalParent || !parent) continue;
    for (const field of ONLINE_STORE_MERGED_FIELDS) {
      const parentValue = num(parent[field] as number | string | null);
      const onlineValue = num(online[field] as number | string | null);
      if (parentValue !== null || onlineValue !== null) {
        parent[field] = (parentValue ?? 0) + (onlineValue ?? 0);
      }
    }
    breakdowns.set(parentCode, {
      onlineBranchCode: onlineCode,
      ownOfftake: num(originalParent.spoDealer as number | string | null),
      ownOfftakeTarget: num(originalParent.spoDealerTarget as number | string | null),
      onlineOfftake: num(online.spoDealer as number | string | null),
      onlineOfftakeTarget: num(online.spoDealerTarget as number | string | null),
    });
  }

  return { rows: merged.filter((row) => !(row.branch in ONLINE_STORE_PARENT_BRANCH)), breakdowns };
}

function computeBranchReport(
  today: BaToolBranchRow,
  yesterday: BaToolBranchRow | undefined,
  serviceInfoToday: ServiceInfoSnapshot | undefined,
  serviceInfoMonth: ServiceInfoSnapshot[],
  partSaleToday: PartSaleSnapshot | undefined,
  partSaleMonth: PartSaleSnapshot[],
  ssrv089GeneralMonth: Ssrv089Snapshot[],
  scom205Today: Scom205Snapshot | undefined,
  billRevenue: { scrapRevenue: number; usedOilRevenue: number }
): BranchReport {
  const y = (key: keyof BaToolBranchRow) => (yesterday ? num(yesterday[key] as number | string | null) : null);
  const t = (key: keyof BaToolBranchRow) => num(today[key] as number | string | null);

  const spoTGloss = t("spoTGloss");
  const spoTGlossTarget = t("spoTGlossTarget");

  const accessoriesPartSaleMtd = sumBy(ssrv089GeneralMonth, (s) => s.totals.accessoriesPartSale);
  const accessoriesLabourSaleMtd = sumBy(ssrv089GeneralMonth, (s) => s.totals.accessoriesLabourSale);
  const externalSalesFromPartsMtd = sumBy(partSaleMonth, (s) => s.counts.externalSales);
  const sprExternal = t("sprExternal");
  const partsRetailAchievementForTheMonth = t("sprInternal");

  const gusRoMtd = t("gus");
  const vasBillTarget = gusRoMtd !== null ? gusRoMtd * VAS_BILL_TARGET_RO_SHARE * VAS_BILL_TARGET_PER_RO : null;
  const vasAchievementForTheMonth = sumBy(serviceInfoMonth, (s) => s.counts.vasRevenue);

  const gusPartsMtd =
    scom205Today && accessoriesPartSaleMtd !== null ? scom205Today.totals.gusSpRevMtd - accessoriesPartSaleMtd : null;
  const gusLabourMtd =
    scom205Today && accessoriesLabourSaleMtd !== null ? scom205Today.totals.gusLabRevMtd - accessoriesLabourSaleMtd : null;
  const bpuPartsMtd = scom205Today?.totals.bpuSpRevMtd ?? null;
  const bpuLabourMtd = scom205Today?.totals.bpuLabRevMtd ?? null;
  const externalSalesMtd =
    sprExternal !== null && externalSalesFromPartsMtd !== null ? sprExternal + externalSalesFromPartsMtd : null;

  return {
    branch: today.branch,

    gusRoBilledForTheDay: delta(t("gus"), y("gus")),
    gusRoMtd,

    bpuRoBilledForTheDay: delta(t("bpus"), y("bpus")),
    bpuRoMtd: t("bpus"),

    // "Tyre Actual"/"Battery Actuals" are already MTD-as-of-today in the BA
    // Tool file, same convention as GUS/BPUS/SPO Dealer/etc — read straight
    // from today's row, never summed across snapshots (that double/triple-
    // counted the same running total once per upload this month). "Today's"
    // figure is derived the same way as gusRoBilledForTheDay: today minus
    // the previous upload's MTD total.
    tireTarget: t("tyreTarget"),
    tireSales: delta(t("tyreActual"), y("tyreActual")),
    tireSalesForTheMonth: t("tyreActual"),

    batteryTarget: t("batteryTarget"),
    batterySales: delta(t("batteryActuals"), y("batteryActuals")),
    batterySalesForTheMonth: t("batteryActuals"),

    targetTGlossService: FIXED_TGLOSS_SERVICE_TARGET,
    penetrationTGlossService: t("servicePenetration"),
    tGlossSpo: ratio(spoTGloss, spoTGlossTarget),

    cpuForTheDay: delta(t("cpus"), y("cpus")),
    cpuAchievementForTheMonth: t("cpus"),

    bpuTarget: t("bpusTarget"),
    bpuForTheDay: delta(t("bpus"), y("bpus")),
    bpuAchievementForTheMonth: t("bpus"),

    offtakeTarget: t("spoDealerTarget"),
    offtakeForThePreviousDay: delta(t("spoDealer"), y("spoDealer")),
    offtakeAchievementForTheMonth: t("spoDealer"),

    partsRetailTarget: t("sprInternalTarget"),
    partsRetailForTheDay: delta(t("sprInternal"), y("sprInternal")),
    partsRetailAchievementForTheMonth,

    pmOcTarget: t("pmTarget"),
    pmOcForTheDay: delta(t("pm"), y("pm")),
    pmOcAchievementForTheMonth: t("pm"),

    vasBillTarget,
    vasAchievementForTheDay: serviceInfoToday?.counts.vasRevenue ?? null,
    vasAchievementForTheMonth,
    vasAchievementPercent: ratio(vasAchievementForTheMonth, vasBillTarget),
    vasGentani: ratio(vasAchievementForTheMonth, gusRoMtd),

    wheelBalancingForTheDay: serviceInfoToday?.counts.wheelBalancing ?? null,
    wheelBalancingMtd: sumBy(serviceInfoMonth, (s) => s.counts.wheelBalancing),
    wheelAlignmentForTheDay: serviceInfoToday?.counts.wheelAlignment ?? null,
    wheelAlignmentMtd: sumBy(serviceInfoMonth, (s) => s.counts.wheelAlignment),
    brakeSkimmingForTheDay: serviceInfoToday?.counts.brakeSkimming ?? null,
    brakeSkimmingMtd: sumBy(serviceInfoMonth, (s) => s.counts.brakeSkimming),
    evaporatorCleaningForTheDay: serviceInfoToday?.counts.evaporatorCleaning ?? null,
    evaporatorCleaningMtd: sumBy(serviceInfoMonth, (s) => s.counts.evaporatorCleaning),

    engineFlushForTheDay: partSaleToday?.counts.engineFlush ?? null,
    engineFlushMtd: sumBy(partSaleMonth, (s) => s.counts.engineFlush),
    injectorCleanerForTheDay: partSaleToday?.counts.injectorCleaner ?? null,
    injectorCleanerMtd: sumBy(partSaleMonth, (s) => s.counts.injectorCleaner),
    syntheticOilForTheDay: partSaleToday?.counts.syntheticOilLtrs ?? null,
    syntheticOilMtd: sumBy(partSaleMonth, (s) => s.counts.syntheticOilLtrs),
    brakeCleaningSprayForTheDay: partSaleToday?.counts.brakeCleaningSpray ?? null,
    brakeCleaningSprayMtd: sumBy(partSaleMonth, (s) => s.counts.brakeCleaningSpray),
    diyCountForTheDay: partSaleToday?.counts.diyCount ?? null,
    diyCountMtd: sumBy(partSaleMonth, (s) => s.counts.diyCount),
    diyRevenueForTheDay: partSaleToday?.counts.diyRevenue ?? null,
    diyRevenueMtd: sumBy(partSaleMonth, (s) => s.counts.diyRevenue),

    gusPartsMtd,
    gusLabourMtd,
    bpuPartsMtd,
    bpuLabourMtd,

    externalSalesMtd,

    scrapRevenueMtd: billRevenue.scrapRevenue,
    usedOilRevenueMtd: billRevenue.usedOilRevenue,

    totalRevenueStreamMtd:
      gusPartsMtd !== null && gusLabourMtd !== null && bpuPartsMtd !== null && bpuLabourMtd !== null && externalSalesMtd !== null
        ? gusPartsMtd + gusLabourMtd + bpuPartsMtd + bpuLabourMtd + externalSalesMtd + billRevenue.scrapRevenue + billRevenue.usedOilRevenue
        : null,
    externalSalesPctOfSprInternal:
      externalSalesMtd !== null && partsRetailAchievementForTheMonth !== null
        ? ratio(externalSalesMtd, partsRetailAchievementForTheMonth + externalSalesMtd)
        : null,
  };
}

function byBranch<T extends { branch: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.branch, item]));
}

function groupByBranch<T extends { branch: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(item.branch) ?? [];
    list.push(item);
    map.set(item.branch, list);
  }
  return map;
}

export async function buildReport(date: string): Promise<Report | null> {
  const today = await loadSnapshot(date);
  if (!today) return null;

  const [
    previous,
    serviceInfoTodayList,
    serviceInfoMonthList,
    partSaleTodayList,
    partSaleMonthList,
    ssrv089GeneralMonthList,
    scom205TodayList,
    billRevenueList,
  ] = await Promise.all([
    loadPreviousSnapshot(date),
    loadAllServiceInfoSnapshotsForDate(date),
    loadAllServiceInfoSnapshotsForMonthUpTo(date),
    loadAllPartSaleSnapshotsForDate(date),
    loadAllPartSaleSnapshotsForMonthUpTo(date),
    loadAllSsrv089SnapshotsForMonthUpTo(date, "general"),
    loadAllScom205SnapshotsForDate(date),
    loadBillRevenueByBranchForMonth(date.slice(0, 7)),
  ]);

  const serviceInfoToday = byBranch(serviceInfoTodayList);
  const serviceInfoMonth = groupByBranch(serviceInfoMonthList);
  const partSaleToday = byBranch(partSaleTodayList);
  const partSaleMonth = groupByBranch(partSaleMonthList);
  const ssrv089GeneralMonth = groupByBranch(ssrv089GeneralMonthList);
  const scom205Today = byBranch(scom205TodayList);
  const billRevenue = new Map(billRevenueList.map((r) => [r.branch, r]));
  const NO_BILL_REVENUE = { scrapRevenue: 0, usedOilRevenue: 0 };

  const { rows: todayBranches, breakdowns: onlineStoreBreakdowns } = mergeOnlineStoreBranches(excludeDeactivatedBranches(today.branches));
  const previousBranches = previous ? mergeOnlineStoreBranches(excludeDeactivatedBranches(previous.branches)).rows : undefined;

  const branches = todayBranches.map((branchRow) => {
    const yesterdayRow = previousBranches?.find((b) => b.branch === branchRow.branch);
    const branchReport = computeBranchReport(
      branchRow,
      yesterdayRow,
      serviceInfoToday.get(branchRow.branch),
      serviceInfoMonth.get(branchRow.branch) ?? [],
      partSaleToday.get(branchRow.branch),
      partSaleMonth.get(branchRow.branch) ?? [],
      ssrv089GeneralMonth.get(branchRow.branch) ?? [],
      scom205Today.get(branchRow.branch),
      billRevenue.get(branchRow.branch) ?? NO_BILL_REVENUE
    );
    const onlineStoreBreakdown = onlineStoreBreakdowns.get(branchRow.branch);
    return onlineStoreBreakdown ? { ...branchReport, onlineStoreBreakdown } : branchReport;
  });

  return {
    date,
    uploadedAt: today.uploadedAt,
    hasPreviousSnapshot: previous !== null,
    previousDate: previous?.date ?? null,
    daysSincePrevious: previous ? daysBetween(date, previous.date) : null,
    branches,
  };
}
