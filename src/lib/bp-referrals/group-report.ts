import { pool } from "@/lib/db";
import { REGIONS, regionForBranch, type RegionName } from "@/lib/regions";
import { NORMALIZE_RO_SQL } from "./ro-normalize";

export type DateRange = { start: string; end: string };

function todayIST(): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

function isValidDateParam(v: string | null | undefined): v is string {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** The group report's default date range — the current calendar year to
 * date (IST), matching how BP HO's own reference sheet was named by year —
 * shared by the Excel export route and the in-app view so they never drift
 * apart. `fromParam`/`toParam` win when they look like real dates. */
export function resolveGroupReportRange(fromParam?: string | null, toParam?: string | null): { from: string; to: string } {
  const today = todayIST();
  const from = isValidDateParam(fromParam) ? fromParam : `${today.slice(0, 4)}-01-01`;
  const to = isValidDateParam(toParam) ? toParam : today;
  return { from, to };
}

/** `from`/`to` are both inclusive calendar dates (as picked in the UI) —
 * loadGroupReportRows wants a half-open [start, end) window, so `to` needs
 * bumping by one day. */
export function inclusiveDateRange(from: string, to: string): DateRange {
  const [y, m, d] = to.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  const end = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  return { start: from, end };
}

/** One row per referral in range, enriched with the matched RO's real
 * financials off the DMS's own Cost & Sales - BP export (raw_upload_rows,
 * report_type 'ssrv089_bp') — Part/Labour/Paint-material Sale and Cost,
 * joined on matched_ro_no the same tolerant way ro-matcher.ts itself
 * matches (see ro-normalize.ts). Unmatched referrals (no ro_matched_at)
 * simply get null financials — this is also how "converted" is defined
 * below, so a converted-only sum just means "only rows with financials". */
export type GroupReportRow = {
  id: number;
  region: RegionName | null;
  assignedBranch: string | null;
  submittedAt: Date | string | null;
  employeeName: string | null;
  employeeId: string | null;
  employeeBranch: string | null;
  vehicleRegNo: string | null;
  vehicleModel: string | null;
  roNo: string | null;
  estimateAmount: number | null;
  /** True once the referral's RO is confirmed against a real DMS job
   * (ro_matched_at set) — the group report's definition of "Converted".
   * The reference Excel sheet BP HO shared tracked "Converted" as a
   * separate manual judgment call that didn't line up with either incentive
   * tier's count; this definition was confirmed with the user 2026-11-09 as
   * the sensible mechanical equivalent, since the old sheet's exact numbers
   * don't need to be reproduced. */
  converted: boolean;
  incentive1: number;
  incentive2: number;
  invoicedAmount: number | null;
  partsRevenue: number | null;
  partsCost: number | null;
  labourRevenue: number | null;
  labourCost: number | null;
  remarks: string | null;
};

function toAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function sumOrNull(...values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length === 0 ? null : present.reduce((a, b) => a + b, 0);
}

function remarksFor(closedReason: string | null, notInterestedReason: string | null, lostReason: string | null): string | null {
  if (closedReason === "not_genuine") return "Not genuine";
  if (closedReason === "not_interested") return notInterestedReason ? `Not interested: ${notInterestedReason}` : "Not interested";
  if (closedReason === "lost") return lostReason ? `Lost: ${lostReason}` : "Lost";
  return null;
}

export async function loadGroupReportRows(range: DateRange, branches?: string[]): Promise<GroupReportRow[]> {
  const { rows } = await pool.query<{
    id: number;
    submitted_at: Date | string | null;
    referring_employee_name: string | null;
    referring_employee_id: string | null;
    referring_employee_branch: string | null;
    assigned_branch: string | null;
    vehicle_reg_no: string | null;
    vehicle_model: string | null;
    matched_ro_no: string | null;
    pending_ro_no: string | null;
    estimate_amount: string | null;
    validated_at: Date | string | null;
    ro_matched_at: Date | string | null;
    closed_reason: string | null;
    not_interested_reason: string | null;
    lost_reason: string | null;
    total_sale: string | null;
    part_sale: string | null;
    part_cost: string | null;
    pnt_mat_sale: string | null;
    pnt_mat_cost: string | null;
    labour_sale: string | null;
    labour_cost: string | null;
  }>(
    `select
       r.id, r.submitted_at, r.referring_employee_name, r.referring_employee_id,
       r.referring_employee_branch, r.assigned_branch, r.vehicle_reg_no, r.vehicle_model,
       r.matched_ro_no, r.pending_ro_no, r.estimate_amount, r.validated_at, r.ro_matched_at,
       r.closed_reason, r.not_interested_reason, r.lost_reason,
       dms.total_sale, dms.part_sale, dms.part_cost, dms.pnt_mat_sale, dms.pnt_mat_cost,
       dms.labour_sale, dms.labour_cost
     from bp_referrals r
     left join lateral (
       select
         row_data->>'Total Sale' as total_sale,
         row_data->>'Part Sale' as part_sale,
         row_data->>'Part Cost' as part_cost,
         row_data->>'Pnt Mat Sale' as pnt_mat_sale,
         row_data->>'Pnt Mat Cost' as pnt_mat_cost,
         row_data->>'Labour Sale' as labour_sale,
         row_data->>'Labour Cost' as labour_cost
       from raw_upload_rows
       where report_type = 'ssrv089_bp'
         and r.matched_ro_no is not null and r.matched_ro_no <> ''
         and ${NORMALIZE_RO_SQL(`upper(coalesce(row_data->>'JobOrder No', ''))`)} = ${NORMALIZE_RO_SQL("upper(r.matched_ro_no)")}
       limit 1
     ) dms on true
     where r.submitted_at >= $1::date and r.submitted_at < $2::date
       and ($3::text[] is null or r.assigned_branch = any($3::text[]))
     order by r.submitted_at`,
    [range.start, range.end, branches ?? null],
  );

  return rows.map((r) => ({
    id: r.id,
    region: r.assigned_branch ? regionForBranch(r.assigned_branch) : null,
    assignedBranch: r.assigned_branch,
    submittedAt: r.submitted_at,
    employeeName: r.referring_employee_name,
    employeeId: r.referring_employee_id,
    employeeBranch: r.referring_employee_branch,
    vehicleRegNo: r.vehicle_reg_no,
    vehicleModel: r.vehicle_model,
    roNo: r.matched_ro_no ?? r.pending_ro_no,
    estimateAmount: toAmount(r.estimate_amount),
    converted: r.ro_matched_at !== null,
    incentive1: r.validated_at !== null ? 50 : 0,
    incentive2: r.ro_matched_at !== null ? 200 : 0,
    invoicedAmount: toAmount(r.total_sale),
    partsRevenue: sumOrNull(toAmount(r.part_sale), toAmount(r.pnt_mat_sale)),
    partsCost: sumOrNull(toAmount(r.part_cost), toAmount(r.pnt_mat_cost)),
    labourRevenue: toAmount(r.labour_sale),
    labourCost: toAmount(r.labour_cost),
    remarks: remarksFor(r.closed_reason, r.not_interested_reason, r.lost_reason),
  }));
}

export type PivotRow = {
  branch: string;
  count: number;
  invoicedAmount: number;
  incentive1Count: number;
  incentive1Amount: number;
  incentive2Count: number;
  incentive2Amount: number;
};

/** Branch-wise counts/sums — the "Pivot" sheet. */
export function buildPivot(rows: GroupReportRow[]): PivotRow[] {
  const byBranch = new Map<string, PivotRow>();
  for (const r of rows) {
    if (!r.assignedBranch) continue;
    let p = byBranch.get(r.assignedBranch);
    if (!p) {
      p = { branch: r.assignedBranch, count: 0, invoicedAmount: 0, incentive1Count: 0, incentive1Amount: 0, incentive2Count: 0, incentive2Amount: 0 };
      byBranch.set(r.assignedBranch, p);
    }
    p.count++;
    p.invoicedAmount += r.invoicedAmount ?? 0;
    if (r.incentive1 > 0) { p.incentive1Count++; p.incentive1Amount += r.incentive1; }
    if (r.incentive2 > 0) { p.incentive2Count++; p.incentive2Amount += r.incentive2; }
  }
  return [...byBranch.values()].sort((a, b) => a.branch.localeCompare(b.branch));
}

export type SummaryRow = {
  region: RegionName | "Total";
  branch: string | null;
  referralCount: number;
  convertedCount: number;
  incentive1Count: number;
  incentive1Amount: number;
  incentive2Count: number;
  incentive2Amount: number;
  revenue: number;
  partsRevenue: number;
  partsMargin: number;
  labourRevenue: number;
  labourMargin: number;
  totalMargin: number;
};

function emptySummary(region: RegionName | "Total", branch: string | null): SummaryRow {
  return {
    region, branch, referralCount: 0, convertedCount: 0, incentive1Count: 0, incentive1Amount: 0,
    incentive2Count: 0, incentive2Amount: 0, revenue: 0, partsRevenue: 0, partsMargin: 0, labourRevenue: 0, labourMargin: 0, totalMargin: 0,
  };
}

function addInto(target: SummaryRow, r: GroupReportRow): void {
  target.referralCount++;
  if (r.converted) target.convertedCount++;
  if (r.incentive1 > 0) { target.incentive1Count++; target.incentive1Amount += r.incentive1; }
  if (r.incentive2 > 0) { target.incentive2Count++; target.incentive2Amount += r.incentive2; }
  target.revenue += r.invoicedAmount ?? 0;
  const partsMargin = (r.partsRevenue ?? 0) - (r.partsCost ?? 0);
  const labourMargin = (r.labourRevenue ?? 0) - (r.labourCost ?? 0);
  target.partsRevenue += r.partsRevenue ?? 0;
  target.partsMargin += partsMargin;
  target.labourRevenue += r.labourRevenue ?? 0;
  target.labourMargin += labourMargin;
  target.totalMargin += partsMargin + labourMargin;
}

/** Region > branch rollup with a per-region subtotal and a grand total —
 * the "Summary" sheet. Branches with zero referrals in range are omitted,
 * same as the reference sheet (it only ever lists branches with activity). */
export function buildSummary(rows: GroupReportRow[]): { byRegion: Map<RegionName, SummaryRow[]>; regionTotals: Map<RegionName, SummaryRow>; grandTotal: SummaryRow } {
  const byRegion = new Map<RegionName, SummaryRow[]>();
  const byRegionBranch = new Map<string, SummaryRow>();
  const regionTotals = new Map<RegionName, SummaryRow>();
  const grandTotal = emptySummary("Total", null);

  for (const r of rows) {
    if (!r.region || !r.assignedBranch) continue;
    const key = `${r.region}::${r.assignedBranch}`;
    let branchRow = byRegionBranch.get(key);
    if (!branchRow) {
      branchRow = emptySummary(r.region, r.assignedBranch);
      byRegionBranch.set(key, branchRow);
      if (!byRegion.has(r.region)) byRegion.set(r.region, []);
      byRegion.get(r.region)!.push(branchRow);
    }
    addInto(branchRow, r);

    let regionRow = regionTotals.get(r.region);
    if (!regionRow) {
      regionRow = emptySummary(r.region, null);
      regionTotals.set(r.region, regionRow);
    }
    addInto(regionRow, r);

    addInto(grandTotal, r);
  }

  for (const list of byRegion.values()) list.sort((a, b) => (a.branch ?? "").localeCompare(b.branch ?? ""));
  return { byRegion, regionTotals, grandTotal };
}

export type RoiRow = {
  region: RegionName | "Group";
  totalReferral: number;
  totalConverted: number;
  conversionPct: number;
  partsRevenue: number;
  labourRevenue: number;
  partsMargin: number;
  labourMargin: number;
  incentiveGiven: number;
  roi: number;
};

/** Region + Group roll-up of the Summary totals — the "ROI" sheet.
 * ROI = Parts Margin + Labour Margin - incentives paid, same formula the
 * reference sheet used (confirmed against its own Group total). */
export function buildRoi(summary: ReturnType<typeof buildSummary>): RoiRow[] {
  const regions = Object.keys(REGIONS) as RegionName[];
  const rows: RoiRow[] = [];
  const group = { totalReferral: 0, totalConverted: 0, partsRevenue: 0, labourRevenue: 0, partsMargin: 0, labourMargin: 0, incentiveGiven: 0 };

  for (const region of regions) {
    const t = summary.regionTotals.get(region);
    if (!t) continue;
    const incentiveGiven = t.incentive1Amount + t.incentive2Amount;
    rows.push({
      region,
      totalReferral: t.referralCount,
      totalConverted: t.convertedCount,
      conversionPct: t.referralCount > 0 ? t.convertedCount / t.referralCount : 0,
      partsRevenue: t.partsRevenue,
      labourRevenue: t.labourRevenue,
      partsMargin: t.partsMargin,
      labourMargin: t.labourMargin,
      incentiveGiven,
      roi: t.partsMargin + t.labourMargin - incentiveGiven,
    });
    group.totalReferral += t.referralCount;
    group.totalConverted += t.convertedCount;
    group.partsRevenue += t.partsRevenue;
    group.labourRevenue += t.labourRevenue;
    group.partsMargin += t.partsMargin;
    group.labourMargin += t.labourMargin;
    group.incentiveGiven += incentiveGiven;
  }

  rows.push({
    region: "Group",
    totalReferral: group.totalReferral,
    totalConverted: group.totalConverted,
    conversionPct: group.totalReferral > 0 ? group.totalConverted / group.totalReferral : 0,
    partsRevenue: group.partsRevenue,
    labourRevenue: group.labourRevenue,
    partsMargin: group.partsMargin,
    labourMargin: group.labourMargin,
    incentiveGiven: group.incentiveGiven,
    roi: group.partsMargin + group.labourMargin - group.incentiveGiven,
  });
  return rows;
}
