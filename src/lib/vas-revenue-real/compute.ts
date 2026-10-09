import { pool } from "../db";
import { isAccessoriesStaff } from "../accessories-staff";
import { tierForBranch } from "../branch-tier";
import { VAS_PRICE_BY_JOB_CODE } from "../vas-price-list";
import { seriesToSize } from "../vas-series-map";

/** 2026-10-01 — before this, VAS revenue stays on the old price-list-only
 * calculation (service-info/parse.ts's vasRevenueForRow, computed at Service
 * Info upload time); this module and its cutover only ever touch
 * 2026-10-01 onwards, at the user's explicit request (see db/schema.sql's
 * vas_revenue_real comment). */
export const VAS_REAL_CUTOVER_DATE = "2026-10-01";

function normalize(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAmount(value: unknown): number {
  const str = normalize(value).replace(/,/g, "");
  if (!str) return 0;
  const n = Number(str);
  return Number.isFinite(n) ? n : 0;
}

/** Same price-list lookup as service-info/parse.ts's vasRevenueForRow — kept
 * as its own copy here (not imported) since that one is tangled up with
 * that parser's own per-row loop and accessories-exclusion timing; this one
 * is the price-list *fallback* path, used only for a row with no real
 * billed amount yet (see computeVasRevenueReal's doc comment). */
function vasPriceListValue(jobCode: string, series: string, tier: "A" | "B" | null): number {
  if (tier === null) return 0;
  const treatment = VAS_PRICE_BY_JOB_CODE.get(jobCode);
  if (!treatment) return 0;
  const prices = tier === "A" ? treatment.tierA : treatment.tierB;
  const onlyXl = prices.small === null && prices.medium === null && prices.large === null;
  if (onlyXl) return prices.xl ?? 0;
  const size = seriesToSize(series);
  if (size === null) return 0;
  return prices[size] ?? 0;
}

export type VasRevenueRealResult = {
  vasRevenue: number;
  /** A VAS-coded Service Info row (GS or BP) matched to a real Labour Sales Report row by Job Order No. + Job Code. */
  matchedRows: number;
  /** No matching Labour Sales Report row yet for this RO/day — priced at the current price list instead (see this module's doc comment and the user's explicit call, 2026-10-09). */
  fallbackRows: number;
  /** Closed by an Accessories-department staff member — contributes nothing, same exclusion as the old price-list-only calculation. */
  excludedRows: number;
};

/**
 * Real VAS revenue for one branch/date (2026-10-01 onwards only — see
 * VAS_REAL_CUTOVER_DATE): every VAS-coded (Job Code like '99TG%') row from
 * that day's Service Info Report — GS and BP both (service_info_bp rows are
 * stored individually as of 2026-10-09, see db/schema.sql) — matched to
 * Labour Sales Report by Job Order No. + Job Code, same join confirmed
 * against real CO01B/IR01A data before this was ever wired in. A row closed
 * by an Accessories-department staff member is excluded entirely (same as
 * the price-list-only calculation always has been); an unmatched row (no
 * Labour Sales Report data yet for that RO) falls back to the current price
 * list for just that one row, at the user's explicit request — never
 * dropped (which would understate revenue) and never holding the rest of
 * the day's real, matched rows back to the old method.
 *
 * Pure computation only — does not read or write vas_revenue_real itself
 * (see store.ts for that) or check the cutover date (see recompute.ts,
 * the only caller that matters for correctness here).
 */
export async function computeVasRevenueReal(branch: string, date: string, staffNames: string[]): Promise<VasRevenueRealResult> {
  const svcInfoRes = await pool.query<{ job_order_no: string | null; job_code: string | null; series: string | null; sa_name: string | null }>(
    `select row_data->>'Job Order No' as job_order_no, row_data->>'Job Code' as job_code,
            row_data->>'Series' as series, row_data->>'Close Service Advisor Name' as sa_name
     from raw_upload_rows
     where report_type in ('service_info', 'service_info_bp') and branch = $1 and date = $2
       and row_data->>'Job Code' ilike '99TG%'`,
    [branch, date]
  );

  const labourRes = await pool.query<{ job_no: string | null; job_code: string | null; after_raw: string | null }>(
    `select row_data->>'Job No.' as job_no, row_data->>'Job Code' as job_code, row_data->>'Sub Total After Discount' as after_raw
     from raw_upload_rows where report_type = 'labour_sales' and branch = $1 and date = $2`,
    [branch, date]
  );
  const labourByKey = new Map<string, number>();
  for (const r of labourRes.rows) {
    const key = normalize(r.job_no) + "|" + normalize(r.job_code);
    labourByKey.set(key, (labourByKey.get(key) ?? 0) + parseAmount(r.after_raw));
  }

  const tier = tierForBranch(branch);
  let vasRevenue = 0;
  let matchedRows = 0;
  let fallbackRows = 0;
  let excludedRows = 0;

  for (const r of svcInfoRes.rows) {
    const jobCode = normalize(r.job_code);
    const series = normalize(r.series);
    const saName = normalize(r.sa_name);
    if (isAccessoriesStaff(staffNames, saName)) {
      excludedRows++;
      continue;
    }
    const key = normalize(r.job_order_no) + "|" + jobCode;
    if (labourByKey.has(key)) {
      matchedRows++;
      vasRevenue += labourByKey.get(key)!;
    } else {
      fallbackRows++;
      vasRevenue += vasPriceListValue(jobCode, series, tier);
    }
  }

  return { vasRevenue, matchedRows, fallbackRows, excludedRows };
}
