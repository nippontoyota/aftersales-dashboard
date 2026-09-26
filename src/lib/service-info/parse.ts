import * as XLSX from "xlsx";
import { isAccessoriesStaff } from "../accessories-staff";
import { tierForBranch } from "../branch-tier";
import { VAS_PRICE_BY_JOB_CODE } from "../vas-price-list";
import { seriesToSize } from "../vas-series-map";

/**
 * Service Info Report — one row per job code performed on a repair order
 * (a single vehicle visit spans many rows: its base service job plus every
 * add-on/part line). Confirmed with the user against a real CO01B export:
 * branch and date come from who's uploading and the date they pick on the
 * upload form — not from any column in this file — so most of what this
 * parser does is count matching "Job Desc" rows for each of the four VAS
 * metrics it covers. Wheel Balancing / Alignment / Evaporator Cleaning are
 * per matching row; Brake Skimming is per distinct "Job Order No" among the
 * matching rows (both discs of one car are two rows — see
 * isBrakeSkimmingDesc). Job Desc has real whitespace inconsistency in the
 * source data (trailing spaces, doubled internal spaces, the odd
 * non-breaking space), so every comparison normalizes whitespace first.
 *
 * VAS revenue (2026-08-31): every row whose "Job Code" is a T-Gloss/Lexus
 * treatment (see vas-price-list.ts) gets matched against the master price
 * list — by Job Code (an exact key) rather than parsing Job Desc text, and
 * by the row's "Series" column mapped to a size class (see
 * vas-series-map.ts), priced at the uploading branch's city tier. A
 * treatment whose price list entry only has an Ex. Large price (the nine
 * Lexus-only treatments) is priced there regardless of Series. A row that
 * matches a known job code but whose Series doesn't map to any size class,
 * or whose branch has no tier on file, contributes nothing — never a wrong
 * guess. This is additive revenue only, confirmed with the user as an
 * informational match against real counts already being uploaded — it
 * doesn't change what the four counts above mean or how they're computed.
 *
 * VAS revenue excludes Accessories-department staff (2026-09-01, at the
 * user's request): a row whose "Close SA Name" is an Accessories staff
 * member for the branch (same list/matching as ssrv089/parse.ts's
 * Accessories Part/Labour Sale — see accessories-staff.ts) contributes
 * nothing to vasRevenue, regardless of job code/series match. Only this
 * total is filtered — the four plain counts above are unaffected.
 */
const JOB_DESC_COLUMN = "Job Desc";
const JOB_CODE_COLUMN = "Job Code";
const SERIES_COLUMN = "Series";
const JOB_ORDER_NO_COLUMN = "Job Order No";
// Not "Close SA Name" (that's SSRV089's column name) — Service Info Report
// exports spell this out in full. Confirmed 2026-09-01 against real
// re-uploaded raw_upload_rows data after the exclusion silently matched
// nothing: the column was never present under the assumed name, so
// isAccessoriesStaff() was always being asked to match against "" and
// correctly (per its own logic) finding nothing every time.
const CLOSE_SA_NAME_COLUMN = "Close Service Advisor Name";

const WHEEL_BALANCING_DESC = "WB (OFF-VEHICLE, TWO WHEELS) - ADJST";
const WHEEL_ALIGNMENT_DESC = "WHEEL ALIGNMENT - INSP";
/** Brake Skimming = any brake-disc resurfacing job: front OR rear axle, done
 * on the car (mobile lathe) or off it (bench lathe), one side or the
 * opposite ("COMB: OPP-GRIND"). The DMS spells the ~8 variants
 * inconsistently ("- GRIND", "-COMB:OPP-GRIND", "- COMB: OPP-GRIND"), so
 * match on shape: "(FR|RR) DISC (ONE SIDE) ((ON|OFF)-VEHICLE) … GRIND".
 *
 * Counted per repair order, not per line — one car's two front discs are
 * two labour lines on the same RO and count as 1 (confirmed with the user
 * 2026-09-07; a plain per-row count ran ~40% high). Widened from front-
 * on-vehicle only to every axle + off-vehicle 2026-09-09, at the user's
 * request. MTD is the sum of the daily per-RO counts. */
export function isBrakeSkimmingDesc(desc: string): boolean {
  return /(?:FR|RR) DISC \(ONE SIDE\) \((?:ON|OFF)-VEHICLE\).*GRIND/i.test(desc);
}
/** Front evaporator only — the rear-evaporator and "Front and Rear" combined
 * treatments are deliberately excluded, as are AC Duct Cleaning, Odour
 * Neutralizer and evaporator R&R (replacement). Confirmed with the user
 * 2026-09-07 (was Front + Rear before). Counted per row. */
const EVAPORATOR_CLEANING_DESC = "TGLOSS Air Fresh-Front Evaporator";

export type ServiceInfoCounts = {
  wheelBalancing: number;
  wheelAlignment: number;
  /** Distinct repair orders with a brake-skimming line that day — not the line count. */
  brakeSkimming: number;
  /** Rows with the front-evaporator T-Gloss treatment — front only (see EVAPORATOR_CLEANING_DESC). */
  evaporatorCleaning: number;
  /** Sum of matched T-Gloss/Lexus treatment retail prices — see the module doc comment above. */
  vasRevenue: number;
};

function normalize(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function vasRevenueForRow(jobCode: string, series: string, tier: "A" | "B" | null): number {
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

export type ParsedServiceInfo = {
  counts: ServiceInfoCounts;
  /** Every row exactly as read from the file, every column — not just the
   * ones this parser uses — so a rule change later (like the accessories-
   * staff exclusion above) can be re-applied without needing the original
   * file back (2026-09-01, at the user's request). See raw-upload-rows/store.ts. */
  rawRows: Record<string, unknown>[];
};

/** The real report data isn't always sheet 1 — same failure mode already
 * caught for SSRV089 (see ssrv089/parse.ts's own comment): a real TR01C
 * Service Info Report export (2026-09-18) turned out to be a pivot-table
 * summary someone built for their own reference (just "Job Desc" +
 * "TGLOSS Air Fresh-Front Evaporator" columns, "Job Desc" holding job-order
 * numbers instead of real descriptions), which the old single-column check
 * below didn't catch since a column literally named "Job Desc" was still
 * present — every count and vasRevenue for that branch/month silently came
 * back 0. Requiring every column the parser actually reads (not just one)
 * is what actually distinguishes real transaction data from a pivot sheet
 * that happens to share one column name. */
function findDataSheet(workbook: XLSX.WorkBook): Record<string, unknown>[] | null {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    // raw: false (2026-09-25) — without it, xlsx's own CSV type-guessing
    // silently mis-parses an ambiguous dash/slash date string as MM-DD-YYYY
    // whenever the day is ≤12, corrupting Invoice Date before this code ever
    // sees it (see ssrv089/parse.ts's own fix note for the full story — this
    // report type is where the date-sanity check was first built, after the
    // CO01A/KL01A incidents, which this may well have been all along).
    // Confirmed safe here: every field this parser reads (Job Desc, Job
    // Order No, Job Code, Close SA Name, Series) is string-compared, never
    // parsed as a number.
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
    if (
      rows.length > 0 &&
      JOB_DESC_COLUMN in rows[0] &&
      JOB_CODE_COLUMN in rows[0] &&
      SERIES_COLUMN in rows[0] &&
      JOB_ORDER_NO_COLUMN in rows[0] &&
      CLOSE_SA_NAME_COLUMN in rows[0]
    ) {
      return rows;
    }
  }
  return null;
}

export function parseServiceInfoWorkbook(buffer: Buffer, branch: string, staffNames: string[]): ParsedServiceInfo {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const rows = findDataSheet(workbook);

  if (!rows) {
    throw new Error(`Could not find a sheet with "${JOB_DESC_COLUMN}", "${JOB_CODE_COLUMN}", "${SERIES_COLUMN}", "${JOB_ORDER_NO_COLUMN}", and "${CLOSE_SA_NAME_COLUMN}" columns — is this a Service Info Report export?`);
  }

  const tier = tierForBranch(branch);
  const counts: ServiceInfoCounts = { wheelBalancing: 0, wheelAlignment: 0, brakeSkimming: 0, evaporatorCleaning: 0, vasRevenue: 0 };
  // Repair orders that had at least one brake-skimming line — counted, not
  // the lines themselves. A blank Job Order No falls back to a per-row token
  // so the RO still counts once and never merges with another blank.
  const brakeSkimmingRos = new Set<string>();

  for (const [rowIndex, row] of rows.entries()) {
    const desc = normalize(row[JOB_DESC_COLUMN]);
    if (desc === WHEEL_BALANCING_DESC) counts.wheelBalancing++;
    else if (desc === WHEEL_ALIGNMENT_DESC) counts.wheelAlignment++;
    else if (isBrakeSkimmingDesc(desc)) brakeSkimmingRos.add(normalize(row[JOB_ORDER_NO_COLUMN]) || ` row-${rowIndex}`);
    else if (desc === EVAPORATOR_CLEANING_DESC) counts.evaporatorCleaning++;

    const jobCode = normalize(row[JOB_CODE_COLUMN]);
    const closeSaName = normalize(row[CLOSE_SA_NAME_COLUMN]);
    if (jobCode && !isAccessoriesStaff(staffNames, closeSaName)) {
      const series = normalize(row[SERIES_COLUMN]);
      counts.vasRevenue += vasRevenueForRow(jobCode, series, tier);
    }
  }

  counts.brakeSkimming = brakeSkimmingRos.size;

  return { counts, rawRows: rows };
}
