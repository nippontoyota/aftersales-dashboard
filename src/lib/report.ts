import type { BaToolBranchRow } from "./ba-tool/parse";
import { loadSnapshot, loadPreviousSnapshot, loadLatestBranchRowInMonthBefore } from "./snapshot-store";
import { loadCombinedServiceInfoSnapshotsForDate, loadCombinedServiceInfoSnapshotsForMonthUpTo } from "./service-info/store";
import type { ServiceInfoSnapshot } from "./service-info/store";
import { loadAllPartSaleSnapshotsForDate, loadAllPartSaleSnapshotsForMonthUpTo } from "./part-sale/store";
import type { PartSaleSnapshot } from "./part-sale/store";
import { loadAllSsrv089SnapshotsForMonthUpTo } from "./ssrv089/store";
import type { Ssrv089Snapshot } from "./ssrv089/store";
import { loadAllScom205SnapshotsForDate } from "./scom205/store";
import type { Scom205Snapshot } from "./scom205/store";
import { loadBillRevenueByBranchForMonth, loadBillRevenueByBranchForDate } from "./bill/store";

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
  spoTGloss: number | null;
  spoTGlossTarget: number | null;
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

  // External Sales MTD (Rs) = the branch's cumulative Part Sale Report
  // "External Sales" filter alone (every row on an `A`-type bill, plus
  // matching `F`-type returns — see part-sale/parse.ts). BA Tool's SPR
  // External is no longer used here as of 2026-09-15. Null whenever Part
  // Sale Report hasn't been uploaded for this branch this month, same
  // conservative rule as GUS Parts MTD above — 0 instead for a Body &
  // Paint-only branch (see BODY_PAINT_ONLY_BRANCHES below).
  externalSalesMtd: number | null;

  // Scrap and used-oil revenue (Rs, without tax) — sum of PDF bill taxable
  // values for this branch, split by the category chosen on upload. Always a
  // number (0 when no bills), never null: bills are optional and their
  // absence means zero, not "unknown". Attributed to the branch that
  // uploaded the bill; counted by upload timestamp, so a published month's
  // figure keeps moving as more bills come in (2026-09-02, at the user's
  // request). ForTheDay = bills uploaded on the report's calendar date —
  // shown on the branch daily report only.
  scrapRevenueForTheDay: number;
  scrapRevenueMtd: number;
  usedOilRevenueForTheDay: number;
  usedOilRevenueMtd: number;

  // From the user's real "Revenue Stream" reference sheet — verified against
  // its embedded formulas directly, not re-derived by us (External Sales
  // input redefined 2026-09-15, see externalSalesMtd above):
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

/** Body & Paint-only branches — no General Service desk, so they don't
 * upload SSRV089-General or (mostly) the Part Sale Report. Without this the
 * null-guards on the GUS accessories deduction and the Part-Sale external
 * component leave their Total Revenue Stream MTD null even though their BPU
 * revenue is real. For these branches GUS Parts/Labour MTD is 0 (there is no
 * general service) and External Sales MTD defaults to 0 when the Part Sale
 * Report is absent (or present with no `A`-type bills) — so Total Revenue =
 * BPU Parts + BPU Labour + External Sales + scrap + used-oil. Confirmed with
 * the user 2026-09-08; External Sales input redefined 2026-09-15 (BA Tool's
 * SPR External dropped from the formula group-wide, including these
 * branches — confirmed 2026-09-15 this also zeroes TR01B/KL01B's External
 * Sales versus their old SPR External figures, since neither files real
 * Part Sale Report `A`-type bills). Revisit if any of them adds a service
 * desk (its scom205 GUS revenue would then be non-zero).
 *
 * Exported so the upload surface stays in step: these branches never get the
 * GS-variant Service Info / Cost & Sales files, so the /upload page hides
 * those two forms for them and pending-uploads.ts drops them from the
 * required set (a BP-only branch is "complete" on 4 reports, not 6). */
export const BODY_PAINT_ONLY_BRANCHES: ReadonlySet<string> = new Set(["CO01E", "KL01B", "TR01B"]);

export function isBodyPaintOnly(branch: string): boolean {
  return BODY_PAINT_ONLY_BRANCHES.has(branch);
}

/** Branch codes that aren't real physical branches — their BA Tool row folds
 * into a parent branch's row and the code itself never appears downstream
 * as its own branch. CO01C is Nippon Toyota's online-store sales channel;
 * its BA Tool row only carries real SPR External / SPO Dealer figures
 * (everything else in it is empty), so only those fields get merged in.
 * Since 2026-09-15, CO01C can also upload its own Part Sale Report (see
 * /upload's "Online Store Part Sale Report" field and
 * /api/upload/part-sale-online) — those rows get merged into CO01A's own
 * partSaleMonth below, the same "folds into the parent" treatment. Optional,
 * not part of any branch's required-uploads set (an online store doesn't
 * transact every day — see pending-uploads.ts / admin-store.ts, which never
 * list CO01C at all). Splitting the parent and online figures back apart for
 * an "expand" view is separate, later work — this only handles the merge. */
const ONLINE_STORE_PARENT_BRANCH: Record<string, string> = {
  CO01C: "CO01A",
};

/** The online-store code for a parent branch's own login (e.g. "CO01A" ->
 * "CO01C"), or undefined if that branch has no online-store channel — used
 * by /api/upload/part-sale-online to attribute an upload to the right code
 * without trusting the client to supply it. */
export function onlineStoreCodeFor(parentBranch: string): string | undefined {
  return Object.entries(ONLINE_STORE_PARENT_BRANCH).find(([, parent]) => parent === parentBranch)?.[0];
}

/** Every online-store code (currently just "CO01C") — not a real branch
 * (excluded from listBranchCodes/pending-uploads, see above), but valid as
 * an Upload Sheet target specifically for a Part Sale Report, since HQ needs
 * a fallback for when CO01A can't file it themselves. */
export const ONLINE_STORE_CODES: readonly string[] = Object.keys(ONLINE_STORE_PARENT_BRANCH);

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

/**
 * `today` is undefined for a branch that has no BA Tool row on this date —
 * either the whole company's BA Tool file is missing for `date` (a
 * not-yet-backfilled historical day, or HQ simply hasn't uploaded it yet)
 * or, in principle, this one branch's row is absent from an otherwise
 * present file. Every BA-Tool-sourced field below (`t(...)`) is null in that
 * case — GUS/BPU RO, Tyre/Battery, targets, SPO, Parts Retail — but
 * everything sourced from the branch's *own* uploads (Service Info, Part
 * Sale, SSRV089, scom205) still computes normally, so a branch that's
 * backfilling its other reports ahead of BA Tool isn't hidden entirely.
 */
function computeBranchReport(
  branch: string,
  today: BaToolBranchRow | undefined,
  yesterday: BaToolBranchRow | undefined,
  serviceInfoToday: ServiceInfoSnapshot | undefined,
  serviceInfoMonth: ServiceInfoSnapshot[],
  partSaleToday: PartSaleSnapshot | undefined,
  partSaleMonth: PartSaleSnapshot[],
  ssrv089GeneralMonth: Ssrv089Snapshot[],
  scom205Today: Scom205Snapshot | undefined,
  billRevenue: { scrapRevenue: number; usedOilRevenue: number },
  billRevenueForTheDay: { scrapRevenue: number; usedOilRevenue: number }
): BranchReport {
  const y = (key: keyof BaToolBranchRow) => (yesterday ? num(yesterday[key] as number | string | null) : null);
  const t = (key: keyof BaToolBranchRow) => (today ? num(today[key] as number | string | null) : null);

  const spoTGloss = t("spoTGloss");
  const spoTGlossTarget = t("spoTGlossTarget");

  const accessoriesPartSaleMtd = sumBy(ssrv089GeneralMonth, (s) => s.totals.accessoriesPartSale);
  const accessoriesLabourSaleMtd = sumBy(ssrv089GeneralMonth, (s) => s.totals.accessoriesLabourSale);
  const externalSalesFromPartsMtd = sumBy(partSaleMonth, (s) => s.counts.externalSales);
  const partsRetailAchievementForTheMonth = t("sprInternal");

  const gusRoMtd = t("gus");
  const vasBillTarget = gusRoMtd !== null ? gusRoMtd * VAS_BILL_TARGET_RO_SHARE * VAS_BILL_TARGET_PER_RO : null;
  const vasAchievementForTheMonth = sumBy(serviceInfoMonth, (s) => s.counts.vasRevenue);

  // A Body & Paint-only branch has no general service, so its GUS Parts/
  // Labour is 0 (not "unknown"), and it never files the SSRV089-General /
  // Part Sale reports the normal null-guards wait for.
  const bodyPaintOnly = BODY_PAINT_ONLY_BRANCHES.has(branch);

  const gusPartsMtd = bodyPaintOnly
    ? 0
    : scom205Today && accessoriesPartSaleMtd !== null
      ? scom205Today.totals.gusSpRevMtd - accessoriesPartSaleMtd
      : null;
  const gusLabourMtd = bodyPaintOnly
    ? 0
    : scom205Today && accessoriesLabourSaleMtd !== null
      ? scom205Today.totals.gusLabRevMtd - accessoriesLabourSaleMtd
      : null;
  const bpuPartsMtd = scom205Today?.totals.bpuSpRevMtd ?? null;
  const bpuLabourMtd = scom205Today?.totals.bpuLabRevMtd ?? null;
  const externalSalesMtd = externalSalesFromPartsMtd ?? (bodyPaintOnly ? 0 : null);

  return {
    branch,

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
    spoTGloss,
    spoTGlossTarget,
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

    scrapRevenueForTheDay: billRevenueForTheDay.scrapRevenue,
    scrapRevenueMtd: billRevenue.scrapRevenue,
    usedOilRevenueForTheDay: billRevenueForTheDay.usedOilRevenue,
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

  const [
    previous,
    serviceInfoTodayList,
    serviceInfoMonthList,
    partSaleTodayList,
    partSaleMonthList,
    ssrv089GeneralMonthList,
    scom205TodayList,
    billRevenueList,
    billRevenueDayList,
  ] = await Promise.all([
    loadPreviousSnapshot(date),
    loadCombinedServiceInfoSnapshotsForDate(date),
    loadCombinedServiceInfoSnapshotsForMonthUpTo(date),
    loadAllPartSaleSnapshotsForDate(date),
    loadAllPartSaleSnapshotsForMonthUpTo(date),
    loadAllSsrv089SnapshotsForMonthUpTo(date, "general"),
    loadAllScom205SnapshotsForDate(date),
    loadBillRevenueByBranchForMonth(date.slice(0, 7)),
    loadBillRevenueByBranchForDate(date),
  ]);

  // Only needed for the !today branch-discovery set below — derived from the
  // month-up-to-date list already fetched above (it includes `date` itself
  // when a snapshot exists for it) rather than a second query.
  const ssrv089GeneralTodayList = ssrv089GeneralMonthList.filter((s) => s.date === date);

  const serviceInfoToday = byBranch(serviceInfoTodayList);
  const serviceInfoMonth = groupByBranch(serviceInfoMonthList);
  const partSaleToday = byBranch(partSaleTodayList);
  const partSaleMonth = groupByBranch(partSaleMonthList);

  // Fold an online store's own Part Sale Report (e.g. CO01C's) into its
  // parent's MTD figures (e.g. CO01A's) — same "folds into the parent"
  // treatment as the BA Tool merge above, just done by concatenating
  // snapshot rows instead of summing individual fields, since sumBy() in
  // computeBranchReport already sums whatever's in the list. Only affects
  // MTD: partSaleToday (the day's own single snapshot, used for the
  // non-External-Sales "for the day" figures) is left un-merged, since an
  // online store's engine-flush/DIY consumable sales are negligible and not
  // worth the added complexity of merging two single-snapshot objects.
  for (const [onlineCode, parentCode] of Object.entries(ONLINE_STORE_PARENT_BRANCH)) {
    const onlineMonth = partSaleMonth.get(onlineCode);
    if (!onlineMonth || onlineMonth.length === 0) continue;
    partSaleMonth.set(parentCode, [...(partSaleMonth.get(parentCode) ?? []), ...onlineMonth]);
  }

  const ssrv089GeneralMonth = groupByBranch(ssrv089GeneralMonthList);
  const scom205Today = byBranch(scom205TodayList);
  const billRevenue = new Map(billRevenueList.map((r) => [r.branch, r]));
  const billRevenueDay = new Map(billRevenueDayList.map((r) => [r.branch, r]));
  const NO_BILL_REVENUE = { scrapRevenue: 0, usedOilRevenue: 0 };

  if (!today) {
    // No BA Tool file at all for this date — a historical day not backfilled
    // yet, or HQ simply hasn't uploaded it. Still show whatever the branches'
    // own reports (Service Info / Part Sale / SSRV089 / scom205) have on
    // file for this exact date, rather than blanking the whole report; every
    // BA-Tool-only field (GUS/BPU RO, Tyre/Battery, targets, SPO, Parts
    // Retail) comes back null for these branches (see computeBranchReport).
    const branchesWithData = new Set<string>([
      ...serviceInfoTodayList.map((s) => s.branch),
      ...partSaleTodayList.map((s) => s.branch),
      ...ssrv089GeneralTodayList.map((s) => s.branch),
      ...scom205TodayList.map((s) => s.branch),
    ]);
    for (const deactivated of DEACTIVATED_BRANCHES) branchesWithData.delete(deactivated);
    // An online store's data is already merged into its parent's
    // partSaleMonth above — make sure the parent shows up here too (even if
    // it filed nothing of its own that day) and the online code never gets
    // its own duplicate row.
    for (const [onlineCode, parentCode] of Object.entries(ONLINE_STORE_PARENT_BRANCH)) {
      if (branchesWithData.has(onlineCode)) branchesWithData.add(parentCode);
      branchesWithData.delete(onlineCode);
    }
    if (branchesWithData.size === 0) return null;

    const branches = [...branchesWithData].sort().map((branch) =>
      computeBranchReport(
        branch,
        undefined,
        undefined,
        serviceInfoToday.get(branch),
        serviceInfoMonth.get(branch) ?? [],
        partSaleToday.get(branch),
        partSaleMonth.get(branch) ?? [],
        ssrv089GeneralMonth.get(branch) ?? [],
        scom205Today.get(branch),
        billRevenue.get(branch) ?? NO_BILL_REVENUE,
        billRevenueDay.get(branch) ?? NO_BILL_REVENUE
      )
    );

    // No BA Tool upload timestamp to anchor on — use the latest of whatever
    // did land today, so the "data as of" footer still means something.
    const candidateTimestamps = [
      ...serviceInfoTodayList.map((s) => s.uploadedAt),
      ...partSaleTodayList.map((s) => s.uploadedAt),
      ...ssrv089GeneralTodayList.map((s) => s.uploadedAt),
      ...scom205TodayList.map((s) => s.uploadedAt),
    ].sort();
    const uploadedAt = candidateTimestamps.at(-1) ?? new Date().toISOString();

    return {
      date,
      uploadedAt,
      hasPreviousSnapshot: previous !== null,
      previousDate: previous?.date ?? null,
      daysSincePrevious: previous ? daysBetween(date, previous.date) : null,
      branches,
    };
  }

  const { rows: todayBranches, breakdowns: onlineStoreBreakdowns } = mergeOnlineStoreBranches(excludeDeactivatedBranches(today.branches));

  // The online store (ONLINE_STORE_PARENT_BRANCH) only appears in the BA Tool
  // on days it transacts. When it's in today's file but not the previous
  // snapshot, diffing merged-vs-merged would dump its whole standing MTD
  // balance onto the parent's "for the day" figure. Give it a real baseline:
  // the most recent same-month snapshot that did carry it (its balance can't
  // have moved while it was absent — no row means no transaction).
  let previousBranchRows = previous?.branches;
  if (previous && previousBranchRows) {
    for (const onlineCode of Object.keys(ONLINE_STORE_PARENT_BRANCH)) {
      const inToday = today.branches.some((b) => b.branch === onlineCode);
      const inPrevious = previousBranchRows.some((b) => b.branch === onlineCode);
      if (!inToday || inPrevious) continue;
      const carried = await loadLatestBranchRowInMonthBefore(date, onlineCode);
      if (carried) previousBranchRows = [...previousBranchRows, carried];
    }
  }

  const previousBranches = previousBranchRows
    ? mergeOnlineStoreBranches(excludeDeactivatedBranches(previousBranchRows)).rows
    : undefined;

  const branches = todayBranches.map((branchRow) => {
    const yesterdayRow = previousBranches?.find((b) => b.branch === branchRow.branch);
    const branchReport = computeBranchReport(
      branchRow.branch,
      branchRow,
      yesterdayRow,
      serviceInfoToday.get(branchRow.branch),
      serviceInfoMonth.get(branchRow.branch) ?? [],
      partSaleToday.get(branchRow.branch),
      partSaleMonth.get(branchRow.branch) ?? [],
      ssrv089GeneralMonth.get(branchRow.branch) ?? [],
      scom205Today.get(branchRow.branch),
      billRevenue.get(branchRow.branch) ?? NO_BILL_REVENUE,
      billRevenueDay.get(branchRow.branch) ?? NO_BILL_REVENUE
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
