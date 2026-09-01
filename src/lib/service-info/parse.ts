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
 * metrics it covers. Job Desc has real trailing-whitespace inconsistency in
 * the source data (e.g. "TGLOSS Air Fresh-Rear Evaporator " with a trailing
 * space), so every comparison normalizes whitespace first.
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
// Not "Close SA Name" (that's SSRV089's column name) — Service Info Report
// exports spell this out in full. Confirmed 2026-09-01 against real
// re-uploaded raw_upload_rows data after the exclusion silently matched
// nothing: the column was never present under the assumed name, so
// isAccessoriesStaff() was always being asked to match against "" and
// correctly (per its own logic) finding nothing every time.
const CLOSE_SA_NAME_COLUMN = "Close Service Advisor Name";

const WHEEL_BALANCING_DESC = "WB (OFF-VEHICLE, TWO WHEELS) - ADJST";
const WHEEL_ALIGNMENT_DESC = "WHEEL ALIGNMENT - INSP";
const BRAKE_SKIMMING_DESCS = ["FR DISC (ONE SIDE) (ON-VEHICLE) - GRIND", "FR DISC (ONE SIDE) (ON-VEHICLE) - COMB: OPP-GRIND"];
const EVAPORATOR_CLEANING_DESCS = ["TGLOSS Air Fresh-Front Evaporator", "TGLOSS Air Fresh-Rear Evaporator"];

export type ServiceInfoCounts = {
  wheelBalancing: number;
  wheelAlignment: number;
  brakeSkimming: number;
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

export function parseServiceInfoWorkbook(buffer: Buffer, branch: string, staffNames: string[]): ParsedServiceInfo {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  if (rows.length === 0) {
    throw new Error("No rows found — is this a Service Info Report export?");
  }
  if (!(JOB_DESC_COLUMN in rows[0])) {
    throw new Error(`Expected a "${JOB_DESC_COLUMN}" column — is this a Service Info Report export?`);
  }

  const tier = tierForBranch(branch);
  const counts: ServiceInfoCounts = { wheelBalancing: 0, wheelAlignment: 0, brakeSkimming: 0, evaporatorCleaning: 0, vasRevenue: 0 };

  for (const row of rows) {
    const desc = normalize(row[JOB_DESC_COLUMN]);
    if (desc === WHEEL_BALANCING_DESC) counts.wheelBalancing++;
    else if (desc === WHEEL_ALIGNMENT_DESC) counts.wheelAlignment++;
    else if (BRAKE_SKIMMING_DESCS.includes(desc)) counts.brakeSkimming++;
    else if (EVAPORATOR_CLEANING_DESCS.includes(desc)) counts.evaporatorCleaning++;

    const jobCode = normalize(row[JOB_CODE_COLUMN]);
    const closeSaName = normalize(row[CLOSE_SA_NAME_COLUMN]);
    if (jobCode && !isAccessoriesStaff(staffNames, closeSaName)) {
      const series = normalize(row[SERIES_COLUMN]);
      counts.vasRevenue += vasRevenueForRow(jobCode, series, tier);
    }
  }

  return { counts, rawRows: rows };
}
