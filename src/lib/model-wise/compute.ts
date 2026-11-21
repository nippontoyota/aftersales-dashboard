import { isAccessoriesStaff } from "../accessories-staff";
import {
  ENGINE_FLUSH_PARTS,
  INJECTOR_CLEANER_PARTS,
  NET_AMNT_COLUMN,
  PART_NO_COLUMN,
  REF_DOC_NO_COLUMN,
  SALE_QTY_COLUMN,
  normalizePart,
  toQty,
} from "../part-sale/parse";
import { CLOSE_SA_NAME_COLUMN, JOB_CODE_COLUMN, JOB_ORDER_NO_COLUMN, SERIES_COLUMN } from "../service-info/parse";
import { VAS_PRICE_BY_JOB_CODE } from "../vas-price-list";
import { seriesToSize } from "../vas-series-map";
import { classifyBrandFromSeries, VEHICLE_BRANDS, type VehicleBrand } from "./brand";

/** Same RO normalization as close-sa-analytics/compute.ts's normalizeRo —
 * dash-stripped, uppercased. Kept as its own copy for the same reason that
 * module's own doc comments give for its small duplicated helpers: this
 * module has no dependency of its own on close-sa-analytics. */
function normalizeRo(value: unknown): string {
  return String(value ?? "").trim().replace(/-/g, "").toUpperCase();
}

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseAmount(value: unknown): number {
  const str = normalizeText(value).replace(/,/g, "");
  if (!str) return 0;
  const n = Number(str);
  return Number.isFinite(n) ? n : 0;
}

/** Part Sale Report PartNo prefixes for Tyre/Battery — see
 * close-sa-analytics/compute.ts's TYRE_PART_PREFIX/BATTERY_PART_PREFIX doc
 * comment for how these were confirmed against real data. */
const TYRE_PART_PREFIX = "T-";
const BATTERY_PART_PREFIX = "B-";

function emptyBrandMap<T>(make: () => T): Record<VehicleBrand, T> {
  return { toyota: make(), alliance: make(), lexus: make() };
}

/** RO (Job Order No, normalized) -> {brand, isBp} for every RO on file in
 * this branch/month's Service Info (GS) + Service Info BP rows — the spine
 * every other join in this module keys off. First occurrence per RO wins
 * (same convention close-sa-analytics/compute.ts uses for roInfoByRo) — a
 * vehicle's Series/brand doesn't change across an RO's own re-uploads. */
export function buildRoBrandMap(
  serviceInfoRows: Record<string, unknown>[],
  serviceInfoBpRows: Record<string, unknown>[]
): Map<string, { brand: VehicleBrand; isBp: boolean }> {
  const map = new Map<string, { brand: VehicleBrand; isBp: boolean }>();
  const allRows: { row: Record<string, unknown>; isBp: boolean }[] = [
    ...serviceInfoRows.map((row) => ({ row, isBp: false })),
    ...serviceInfoBpRows.map((row) => ({ row, isBp: true })),
  ];
  for (const { row, isBp } of allRows) {
    const ro = normalizeRo(row[JOB_ORDER_NO_COLUMN]);
    if (!ro || map.has(ro)) continue;
    const brand = classifyBrandFromSeries(normalizeText(row[SERIES_COLUMN]));
    map.set(ro, { brand, isBp });
  }
  return map;
}

export type RoCounts = Record<VehicleBrand, number>;

/** Distinct RO counts per brand, split GS vs BP — straight off the RO→brand
 * map, no reconciliation needed (unlike Parts/Labour ₹ below, there's no
 * separate "official" RO count this needs to tie to; Service Info's own RO
 * count already IS the figure the rest of the dashboard uses). */
export function countRosByBrand(roBrand: Map<string, { brand: VehicleBrand; isBp: boolean }>): {
  gus: RoCounts;
  bp: RoCounts;
} {
  const gus = emptyBrandMap(() => 0);
  const bp = emptyBrandMap(() => 0);
  for (const { brand, isBp } of roBrand.values()) {
    if (isBp) bp[brand]++;
    else gus[brand]++;
  }
  return { gus, bp };
}

export type RawPartsLabour = { parts: number; labour: number };

/** Raw (unreconciled) Parts/Labour Sale by brand from one month's SSRV089
 * (Cost & Sales) rows, joined to the RO→brand map by JobOrder No. Parts =
 * "Part Sale" + "Oil Sale" (confirmed against real CO01B Oct 2026 data:
 * Total Sale - Labour Sale ≈ Part Sale + Oil Sale + Outside Sale + Pnt Mat
 * Sale almost exactly, and the latter two are ~0 in practice for GS rows —
 * omitting Oil Sale alone had undercounted Parts by ~20%). A row whose RO
 * isn't in roBrand (not on file in this branch/month's Service Info) falls
 * into `unclassified` rather than being silently dropped or guessed into a
 * brand. */
export function sumRawPartsLabourByBrand(
  ssrv089Rows: Record<string, unknown>[],
  roBrand: Map<string, { brand: VehicleBrand; isBp: boolean }>
): { byBrand: Record<VehicleBrand, RawPartsLabour>; unclassified: RawPartsLabour & { roCount: number } } {
  const byBrand = emptyBrandMap<RawPartsLabour>(() => ({ parts: 0, labour: 0 }));
  const unclassified = { parts: 0, labour: 0, roCount: 0 };
  const unclassifiedRos = new Set<string>();
  for (const row of ssrv089Rows) {
    const ro = normalizeRo(row["JobOrder No"]);
    const parts = parseAmount(row["Part Sale"]) + parseAmount(row["Oil Sale"]);
    const labour = parseAmount(row["Labour Sale"]);
    const info = ro ? roBrand.get(ro) : undefined;
    if (!info) {
      unclassified.parts += parts;
      unclassified.labour += labour;
      if (ro) unclassifiedRos.add(ro);
      continue;
    }
    byBrand[info.brand].parts += parts;
    byBrand[info.brand].labour += labour;
  }
  unclassified.roCount = unclassifiedRos.size;
  return { byBrand, unclassified };
}

/** Scales raw per-brand Parts/Labour sums so Toyota+Alliance+Lexus+
 * Unclassified sum EXACTLY to the official GUS/BPU Parts & Labour MTD total
 * (gusPartsMtd/gusLabourMtd/bpuPartsMtd/bpuLabourMtd from report.ts) —
 * confirmed with the user this is the intended reconciliation (their own
 * manual Excel is already "Reconciled to official GUS/BPU Parts & Labour
 * MTD"), and confirmed necessary against real data: SSRV089's raw totals
 * don't tie to the official MTD figure 1:1 (known duplicate-upload noise,
 * see the "SSRV089 reconciliation" tracker), but each brand's *share* of the
 * raw total matched the user's own Excel almost exactly once Lexus
 * classification was fixed (Labour nearly exact, Parts within ~1.5
 * percentage points, CO01B Oct 2026) — so scaling preserves that accurate
 * split while still tying the headline number to the one the rest of the
 * dashboard already shows. A brand with zero raw revenue (e.g. no Lexus ROs
 * this branch/month) gets zero scaled revenue too, not an even split. */
export function scaleToOfficialTotal(
  raw: Record<VehicleBrand, RawPartsLabour>,
  unclassified: RawPartsLabour,
  officialParts: number | null,
  officialLabour: number | null
): Record<VehicleBrand, RawPartsLabour> {
  const rawTotalParts = VEHICLE_BRANDS.reduce((sum, b) => sum + raw[b].parts, 0) + unclassified.parts;
  const rawTotalLabour = VEHICLE_BRANDS.reduce((sum, b) => sum + raw[b].labour, 0) + unclassified.labour;

  const scaled = emptyBrandMap<RawPartsLabour>(() => ({ parts: 0, labour: 0 }));
  for (const brand of VEHICLE_BRANDS) {
    scaled[brand].parts =
      officialParts !== null && rawTotalParts > 0 ? (raw[brand].parts / rawTotalParts) * officialParts : 0;
    scaled[brand].labour =
      officialLabour !== null && rawTotalLabour > 0 ? (raw[brand].labour / rawTotalLabour) * officialLabour : 0;
  }
  return scaled;
}

/** Raw (unreconciled) TGLOSS revenue by brand — every Service Info (GS+BP)
 * row whose Job Code is a T-Gloss/Lexus treatment, matched against the
 * price list by Series size class and branch tier, excluding Accessories-
 * department staff. Close to, but not identical to, report.ts's own
 * branch-level `vasAchievementForTheMonth` (within ~1% against real CO01B
 * Oct 2026 data) — that field uses vas_revenue_real (Labour Sales Report
 * real billed amounts, price-list fallback per unmatched row, from the
 * 2026-10-09
 * cutover onward — see vas-revenue-real/compute.ts), which this function
 * deliberately does NOT replicate (it would need its own Labour Sales
 * Report join). Used only for each brand's proportional SHARE of TGLOSS
 * revenue, the same way raw SSRV089 sums are used for Parts/Labour above —
 * load.ts scales this to the real vasAchievementForTheMonth total via
 * scaleTglossToOfficialTotal below, so the displayed figure always ties to
 * what the rest of the dashboard shows. */
export function sumRawTglossRevenueByBrand(
  serviceInfoRows: Record<string, unknown>[],
  serviceInfoBpRows: Record<string, unknown>[],
  roBrand: Map<string, { brand: VehicleBrand; isBp: boolean }>,
  tier: "A" | "B" | null,
  accessoriesStaffNames: string[]
): Record<VehicleBrand, number> {
  const byBrand = emptyBrandMap<number>(() => 0);
  if (tier === null) return byBrand;

  for (const row of [...serviceInfoRows, ...serviceInfoBpRows]) {
    const jobCode = normalizeText(row[JOB_CODE_COLUMN]);
    const treatment = VAS_PRICE_BY_JOB_CODE.get(jobCode);
    if (!treatment) continue;
    const closeSaName = normalizeText(row[CLOSE_SA_NAME_COLUMN]);
    if (isAccessoriesStaff(accessoriesStaffNames, closeSaName)) continue;

    const ro = normalizeRo(row[JOB_ORDER_NO_COLUMN]);
    const info = ro ? roBrand.get(ro) : undefined;
    if (!info) continue;

    const prices = tier === "A" ? treatment.tierA : treatment.tierB;
    const onlyXl = prices.small === null && prices.medium === null && prices.large === null;
    let value = 0;
    if (onlyXl) {
      value = prices.xl ?? 0;
    } else {
      const size = seriesToSize(normalizeText(row[SERIES_COLUMN]));
      value = size !== null ? prices[size] ?? 0 : 0;
    }
    byBrand[info.brand] += value;
  }
  return byBrand;
}

/** Scales raw per-brand TGLOSS shares so they sum exactly to the official
 * `vasAchievementForTheMonth` total (report.ts's real/price-list-fallback
 * figure) — same reasoning and same pattern as scaleToOfficialTotal above,
 * just one amount instead of two (Parts/Labour). */
export function scaleTglossToOfficialTotal(raw: Record<VehicleBrand, number>, officialTotal: number | null): Record<VehicleBrand, number> {
  const rawTotal = VEHICLE_BRANDS.reduce((sum, b) => sum + raw[b], 0);
  const scaled = emptyBrandMap<number>(() => 0);
  if (officialTotal === null || rawTotal <= 0) return scaled;
  for (const brand of VEHICLE_BRANDS) scaled[brand] = (raw[brand] / rawTotal) * officialTotal;
  return scaled;
}

export type ItemFigures = {
  injectorCleanerCount: number;
  injectorCleanerRevenue: number;
  engineFlushCount: number;
  engineFlushRevenue: number;
  tyreCount: number;
  tyreRevenue: number;
  batteryCount: number;
  batteryRevenue: number;
};

function emptyItemFigures(): ItemFigures {
  return {
    injectorCleanerCount: 0,
    injectorCleanerRevenue: 0,
    engineFlushCount: 0,
    engineFlushRevenue: 0,
    tyreCount: 0,
    tyreRevenue: 0,
    batteryCount: 0,
    batteryRevenue: 0,
  };
}

/** Injector Cleaner / Engine Flush / Tyre / Battery — count + revenue, by
 * brand, from one month's Part Sale Report rows (GS+BP combined — the RO
 * prefix doesn't matter here, only its brand). Joined by RefDocNo (dash-
 * stripped) to the RO→brand map, same join close-sa-analytics/compute.ts
 * uses for these same four part categories — confirmed there to match only
 * ~65-68% of rows to a real RO, never assumed exhaustive, so (unlike GUS/BPU
 * Parts & Labour above) there is no official total to reconcile these
 * against — shown as best-available from Part Sale Report, same caveat the
 * rest of the app already carries for these metrics. A row whose RefDocNo
 * doesn't match any RO this branch/month is simply not counted (same "don't
 * guess" convention as the rest of this module). */
export function sumItemsByBrand(
  partSaleRows: Record<string, unknown>[],
  roBrand: Map<string, { brand: VehicleBrand; isBp: boolean }>
): Record<VehicleBrand, ItemFigures> {
  const byBrand = emptyBrandMap<ItemFigures>(emptyItemFigures);

  for (const row of partSaleRows) {
    const refDoc = normalizeRo(row[REF_DOC_NO_COLUMN]);
    if (!refDoc) continue;
    const info = roBrand.get(refDoc);
    if (!info) continue;
    const m = byBrand[info.brand];

    const part = normalizePart(row[PART_NO_COLUMN]);
    const qty = toQty(row[SALE_QTY_COLUMN]);
    const netAmnt = toQty(row[NET_AMNT_COLUMN]);

    if (ENGINE_FLUSH_PARTS.includes(part)) {
      m.engineFlushCount += qty;
      m.engineFlushRevenue += netAmnt;
    } else if (INJECTOR_CLEANER_PARTS.includes(part)) {
      m.injectorCleanerCount += qty;
      m.injectorCleanerRevenue += netAmnt;
    }

    const upperPart = part.toUpperCase();
    if (upperPart.startsWith(TYRE_PART_PREFIX)) {
      m.tyreCount += qty;
      m.tyreRevenue += netAmnt;
    } else if (upperPart.startsWith(BATTERY_PART_PREFIX)) {
      m.batteryCount += qty;
      m.batteryRevenue += netAmnt;
    }
  }
  return byBrand;
}

export type ModelWiseBranchResult = {
  branch: string;
  gusRos: RoCounts;
  bpRos: RoCounts;
  gus: Record<VehicleBrand, RawPartsLabour>;
  bp: Record<VehicleBrand, RawPartsLabour>;
  tgloss: Record<VehicleBrand, number>;
  items: Record<VehicleBrand, ItemFigures>;
  /** Raw (unscaled) Parts/Labour that joined to an RO outside this
   * branch/month's own Service Info — shown so the scaling above is never
   * silently hiding a chunk of revenue. Usually tiny (~0.03% of the branch's
   * total, confirmed against real data) but never assumed zero. */
  unclassifiedGus: RawPartsLabour & { roCount: number };
  unclassifiedBp: RawPartsLabour & { roCount: number };
};

/** One branch/month's full Model-wise computation — the single entry point
 * load.ts calls per branch. `officialGus`/`officialBp` are that branch's
 * already-computed gusPartsMtd/gusLabourMtd and bpuPartsMtd/bpuLabourMtd
 * from report.ts's BranchReport (the reconciliation targets); null for
 * either means report.ts has no figure to reconcile against (e.g. a branch
 * that hasn't uploaded scom205 yet, or a GS-less BP-only branch for the GUS
 * side), in which case that side's brand split is left at zero rather than
 * guessed. */
export function computeModelWiseBranch(params: {
  branch: string;
  serviceInfoRows: Record<string, unknown>[];
  serviceInfoBpRows: Record<string, unknown>[];
  ssrv089Rows: Record<string, unknown>[];
  ssrv089BpRows: Record<string, unknown>[];
  partSaleRows: Record<string, unknown>[];
  tier: "A" | "B" | null;
  accessoriesStaffNames: string[];
  officialGus: { parts: number | null; labour: number | null };
  officialBp: { parts: number | null; labour: number | null };
  /** report.ts's vasAchievementForTheMonth for this branch/month — the
   * reconciliation target for TGLOSS, same role officialGus/officialBp play
   * for Parts/Labour. */
  officialTgloss: number | null;
}): ModelWiseBranchResult {
  const {
    branch,
    serviceInfoRows,
    serviceInfoBpRows,
    ssrv089Rows,
    ssrv089BpRows,
    partSaleRows,
    tier,
    accessoriesStaffNames,
    officialGus,
    officialBp,
    officialTgloss,
  } = params;

  const roBrand = buildRoBrandMap(serviceInfoRows, serviceInfoBpRows);
  const { gus: gusRos, bp: bpRos } = countRosByBrand(roBrand);

  const gusRaw = sumRawPartsLabourByBrand(ssrv089Rows, roBrand);
  const bpRaw = sumRawPartsLabourByBrand(ssrv089BpRows, roBrand);

  const gus = scaleToOfficialTotal(gusRaw.byBrand, gusRaw.unclassified, officialGus.parts, officialGus.labour);
  const bp = scaleToOfficialTotal(bpRaw.byBrand, bpRaw.unclassified, officialBp.parts, officialBp.labour);

  const rawTgloss = sumRawTglossRevenueByBrand(serviceInfoRows, serviceInfoBpRows, roBrand, tier, accessoriesStaffNames);
  const tgloss = scaleTglossToOfficialTotal(rawTgloss, officialTgloss);
  const items = sumItemsByBrand(partSaleRows, roBrand);

  return {
    branch,
    gusRos,
    bpRos,
    gus,
    bp,
    tgloss,
    items,
    unclassifiedGus: gusRaw.unclassified,
    unclassifiedBp: bpRaw.unclassified,
  };
}

/** Sums several branches' results into one company-wide total — every field
 * here is additive (brand-share scaling already happened per-branch against
 * that branch's own official total, so summing scaled figures across
 * branches is safe and still ties to the sum of those branches' official
 * totals). */
export function sumModelWiseBranches(results: ModelWiseBranchResult[]): Omit<ModelWiseBranchResult, "branch"> {
  const sumRoCounts = (pick: (r: ModelWiseBranchResult) => RoCounts): RoCounts => {
    const out = emptyBrandMap(() => 0);
    for (const r of results) for (const b of VEHICLE_BRANDS) out[b] += pick(r)[b];
    return out;
  };
  const sumPartsLabour = (pick: (r: ModelWiseBranchResult) => Record<VehicleBrand, RawPartsLabour>): Record<VehicleBrand, RawPartsLabour> => {
    const out = emptyBrandMap<RawPartsLabour>(() => ({ parts: 0, labour: 0 }));
    for (const r of results) {
      for (const b of VEHICLE_BRANDS) {
        out[b].parts += pick(r)[b].parts;
        out[b].labour += pick(r)[b].labour;
      }
    }
    return out;
  };
  const sumTgloss = (): Record<VehicleBrand, number> => {
    const out = emptyBrandMap<number>(() => 0);
    for (const r of results) for (const b of VEHICLE_BRANDS) out[b] += r.tgloss[b];
    return out;
  };
  const sumItems = (): Record<VehicleBrand, ItemFigures> => {
    const out = emptyBrandMap<ItemFigures>(emptyItemFigures);
    for (const r of results) {
      for (const b of VEHICLE_BRANDS) {
        const dst = out[b];
        const src = r.items[b];
        dst.injectorCleanerCount += src.injectorCleanerCount;
        dst.injectorCleanerRevenue += src.injectorCleanerRevenue;
        dst.engineFlushCount += src.engineFlushCount;
        dst.engineFlushRevenue += src.engineFlushRevenue;
        dst.tyreCount += src.tyreCount;
        dst.tyreRevenue += src.tyreRevenue;
        dst.batteryCount += src.batteryCount;
        dst.batteryRevenue += src.batteryRevenue;
      }
    }
    return out;
  };
  const sumUnclassified = (pick: (r: ModelWiseBranchResult) => RawPartsLabour & { roCount: number }) => {
    let parts = 0,
      labour = 0,
      roCount = 0;
    for (const r of results) {
      parts += pick(r).parts;
      labour += pick(r).labour;
      roCount += pick(r).roCount;
    }
    return { parts, labour, roCount };
  };

  return {
    gusRos: sumRoCounts((r) => r.gusRos),
    bpRos: sumRoCounts((r) => r.bpRos),
    gus: sumPartsLabour((r) => r.gus),
    bp: sumPartsLabour((r) => r.bp),
    tgloss: sumTgloss(),
    items: sumItems(),
    unclassifiedGus: sumUnclassified((r) => r.unclassifiedGus),
    unclassifiedBp: sumUnclassified((r) => r.unclassifiedBp),
  };
}
