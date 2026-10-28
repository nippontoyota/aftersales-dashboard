import {
  BRAKE_CLEANING_SPRAY_PARTS,
  BILL_NO_COLUMN as PS_BILL_NO_COLUMN,
  CUSTOMER_NAME_COLUMN as PS_CUSTOMER_NAME_COLUMN,
  DIY_PART_PREFIX,
  ENGINE_FLUSH_PARTS,
  INJECTOR_CLEANER_PARTS,
  NET_AMNT_COLUMN as PS_NET_AMNT_COLUMN,
  PART_NO_COLUMN as PS_PART_NO_COLUMN,
  REF_DOC_NO_COLUMN as PS_REF_DOC_NO_COLUMN,
  SALE_QTY_COLUMN as PS_SALE_QTY_COLUMN,
  SYNTHETIC_OIL_PARTS,
  alwaysEligible,
  isExcludedCustomer,
  isExternalSalesRow,
  normalizePart,
  toQty,
} from "../part-sale/parse";
import {
  CLOSE_SA_NAME_COLUMN,
  EVAPORATOR_CLEANING_DESC,
  JOB_CODE_COLUMN,
  JOB_DESC_COLUMN,
  JOB_ORDER_NO_COLUMN,
  SERIES_COLUMN,
  WHEEL_ALIGNMENT_DESC,
  WHEEL_BALANCING_DESC,
  isBrakeSkimmingDesc,
} from "../service-info/parse";
import { VAS_PRICE_BY_JOB_CODE } from "../vas-price-list";
import { seriesToSize } from "../vas-series-map";

/**
 * Close SA Analytics — everything Service Info / Labour Sales / Part Sale
 * can attribute to whichever Service Advisor closed an RO. Cost & Sales
 * (SSRV089) is deliberately left out (set aside by the user, 2026-10-22).
 *
 * Service Info is the spine: it's the only one of the three with a Close SA
 * name directly on the row, keyed by Job Order No (undashed, e.g.
 * "GSJ2610338"). Labour Sales has no SA field — its "Job No." is the exact
 * same undashed RO number (confirmed 100% match across 5 branches, same
 * join vas-revenue-real/compute.ts already uses), so every labour line joins
 * straight onto the RO's Close SA. Part Sale has no SA field and no RO field
 * either, in the normal sense — but its "RefDocNo" turns out to carry the RO
 * number too, just dashed ("GSJ26-06851") — confirmed ~65-68% real match
 * rate across 3 branches once the dash is stripped, never 100%, so every
 * result here also reports how many ROs it actually matched.
 *
 * A Service Info row is one job code on one RO — a single visit spans many
 * rows (its base service plus every add-on). RO-level attributes (Close SA,
 * Vin, Job Type, Pay Type, flags, Invoice info) repeat identically across
 * every one of an RO's rows (same pattern already confirmed for SSRV089's
 * OpenJobDate and Labour Sales' Over Target) — read once per RO, not summed
 * per row. Job Desc / VAS counts are genuinely per-row (each row is one job
 * performed) and attributed to that row's RO's Close SA.
 *
 * Labour Sales / Part Sale attribution (which SA a labour or parts line
 * belongs to) deliberately does NOT use `serviceInfoRows`/`serviceInfoBpRows`
 * above — those are this one day's Service Info only, but a labour/parts
 * line's own date (Doc. Date / RefDocNo's RO) routinely lands on a different
 * day than its RO's Service Info date: a Service Info (BP) upload is
 * bucketed by Invoice Date/Job Close Date, not Job Open Date, so an
 * insurance body-repair job that stays open 4-6+ weeks (confirmed 2026-10-23
 * against real CO01E/KL01B data — up to 45 days) only ever has ONE date on
 * file for it, and a fixed window around that date is just a smaller
 * version of the same bug. `roCloseSaMap` (recompute.ts, via
 * raw-upload-rows/store.ts's loadRoCloseSaPairs — the branch's whole
 * history, not scoped to this date at all) is the fix: it's used only for
 * Labour Sales/Part Sale's closeSaName lookup, never for RO count / vehicle
 * count / job-type counts etc., which stay correctly scoped to this day's
 * own Service Info (`roInfoByRo`).
 */

const VIN_COLUMN = "Vin no";
const JOB_TYPE_COLUMN = "Job Type";
const PAY_TYPE_COLUMN = "Pay Type";
const AMC_FLAG_COLUMN = "AMC Flag";
const FMSC_FLAG_COLUMN = "FMSC Flag";
const EM_FLAG_COLUMN = "EM Flag";
const BP_POTENTIAL_COLUMN = "BP Potential";
const APPOINTMENT_WALKIN_COLUMN = "APPOINTMENT/WALK IN";
const APPOINTMENT_VALUE = "APPOINTMENT";

const LS_JOB_NO_COLUMN = "Job No.";
const LS_JOB_CODE_COLUMN = "Job Code";
const LS_SUB_TOTAL_BEFORE_COLUMN = "Sub Total (Labour)";
const LS_SUB_TOTAL_AFTER_COLUMN = "Sub Total After Discount";
const LS_SOLD_HOUR_COLUMN = "Sold Hour";
const LS_OVER_TARGET_COLUMN = "Over Target";

const BP_EST_AMT_COLUMN = "EST_AMT";
const BP_FINAL_INV_AMT_COLUMN = "FINAL_INV_AMT";
/** Confirmed real values 2026-10-23: "1.Grooming Repair", "2.Superlight
 * Repair", "3.Light Repair", "4.Medium Repair", "5.Heavy Repair" — BP only. */
const BP_REP_TYPE_COLUMN = "BP Rep Type";
/** BP's own Work Order number (e.g. "BPP260323601") — distinct from Job
 * Order No (the RO, e.g. "BPJ2603236"). Confirmed 2026-10-24 against real
 * CO01A data: never more than one Work Order per RO, but not every RO has
 * one (342 distinct ROs vs 317 distinct Work Orders, Oct 2026). */
const WORK_ORDER_NO_COLUMN = "workOrdNo";
/** BP only — two separate columns (unlike Job Open/Invoice Date's combined
 * date+time elsewhere). Time is 4-digit zero-padded "HHMM", no colon
 * (confirmed against real data: "0900".."2300", 47 distinct values). */
const PROMISE_DELIVERY_DATE_COLUMN = "Promise Delivery Date";
const PROMISE_DELIVERY_TIME_COLUMN = "Promise Delivery Time";
/** The 9th (final) customer SMS's send timestamp — confirmed 2026-10-24
 * against real data to track within minutes of Invoice Date across every
 * sample checked, i.e. it's sent right at vehicle handover. Used as BP OTD's
 * "actually given over" timestamp, at the user's explicit direction (over
 * Invoice Date, which also works but wasn't what they asked for). Raw
 * column name's spelling ("NINETH") is the DMS export's own, not a typo. */
const NINTH_SMS_SEND_DT_COLUMN = "NINETH_SMS_SEND_DT";
/** BP OTD's on-time window, confirmed with the user 2026-10-24 — revised
 * same day from an initial "strict 24h before" to a calendar-day-based
 * window, then again to 2 days: on-time is [midnight at the start of the
 * calendar day 2 days before the Promise date, Promise Date/Time] — e.g.
 * Promise = 24/10 18:00 means anything from 22/10 00:00 through 24/10 18:00
 * counts, not a rolling 48h countback from 18:00. Arriving before that
 * midnight, or after the promise, fails — deliberately not "early is fine". */
const BP_OTD_WINDOW_DAYS = 2;
const MINUTES_PER_DAY = 24 * 60;

const JOB_OPEN_DATE_COLUMN = "Job Open Date";
const JOB_OPEN_TIME_COLUMN = "Job Open Time";
const INVOICE_DATE_COLUMN = "Invoice Date";
const INVOICE_TIME_COLUMN = "Invoice Time";

/** EM Flag's real values, confirmed against real data (2026-10-22): "NO",
 * or "EM60"/"EM90"/"EM120" — never a plain "Y" (an earlier small sample had
 * misleadingly suggested Y/N). Always RO-level, always paired with at least
 * one Periodic Maintenance job line on that RO (verified against 5 real
 * ROs) — this module only tracks EM60 specifically, at the user's request;
 * EM90/EM120 are deliberately ignored here. */
const EM60_VALUE = "EM60";
/** On-Time Delivery target for an EM60 RO: Job Open to Invoice must be at
 * or under this many minutes (confirmed with the user 2026-10-23 — "should
 * be exactly 60 minutes" meant the target is 60, not a tolerance window;
 * finishing early still counts as on-time). */
const EM60_TARGET_MINUTES = 60;

/** Part Sale Report PartNo prefixes for Tyre / Battery sales — confirmed
 * against real data (2026-10-22, at the user's request): "T-" rows are
 * genuine tyre SKUs (brand + size, e.g. "T-TY01A-17104" / "215/60 R17 96H
 * Apterra cross"), "B-" rows are genuine battery SKUs (e.g. "B-BA01A-60P10"
 * / "AMARON FLO-60 Ah-DIN66") — not to be confused with the ILIKE '%tyre%'/
 * '%battery%' false positives elsewhere in this report (tyre dresser spray,
 * key-fob "battery transmitter", neither an actual tyre/battery sale). */
const TYRE_PART_PREFIX = "T-";
const BATTERY_PART_PREFIX = "B-";

/** "TGLOSS Mech Care" — exact Job Desc match, same pattern as Wheel
 * Balancing/Alignment. Confirmed 2026-10-23, at the user's request. */
const MECH_CARE_DESC = "TGLOSS Mech Care";

/** Brake Cleaning Labour — confirmed 2026-10-23, at the user's request: no
 * job literally named "brake cleaning" exists; "CL/LU" (Clean/Lubricate) on
 * a disc brake is the real labour op. FR + RR, both plain and the
 * opposite-side "COMB" variant. */
const BRAKE_CLEANING_LABOUR_CODES = new Set(["046043", "46043", "046043A", "46083"]);

/** A Periodic Maintenance job — any "X,000 KM SERVICE" or "Vcare - X,000 KM
 * SERVICE" line, regardless of EM flag. Denominator for EM-to-PM % (EM
 * Flag any real tier ÷ this). Matches on Job Desc, same convention as the
 * rest of this module (job codes for these aren't a clean numeric pattern
 * across every branch's export, confirmed against real samples). */
const PM_JOB_DESC_PATTERN = /^(?:\d{1,3}(?:,\d{2,3})*\s*KM SERVICE|Vcare - )/i;

/** PDI (Pre-Delivery Inspection) — the job an SA does almost exclusively if
 * they're a dedicated PDI advisor rather than a general one (confirmed
 * 2026-10-22: one real SA had 24/24 ROs be exactly this, zero revenue). */
export const PDI_JOB_DESC = "PRE-DELIVERY SERVICE - INSP";

/** Catch-all/generic Job Codes the DMS itself uses for "doesn't fit a
 * specific code" lines (e.g. "47299 OTHERS - BRAKE SHOE-DRUM", "ACCINS99
 * Accessories Installation") — every one seen ends in "99". Excluded from
 * the Same Car Same Work Repeat check (confirmed with the user 2026-10-23):
 * these bundle many different real jobs under one code, so two "OTHERS -"
 * lines on the same car are not evidence of the same actual work repeating. */
export function isGenericCatchAllJobCode(jobCode: string): boolean {
  return jobCode.toUpperCase().endsWith("99");
}

/** Same Car Same Work Repeat window — confirmed with the user 2026-10-23. */
export const REPEAT_JOB_WINDOW_DAYS = 30;

export function normalizeCloseSaName(name: unknown): string {
  return String(name ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeRo(value: unknown): string {
  return String(value ?? "").trim().replace(/-/g, "").toUpperCase();
}

/** Body & Paint ROs are prefixed "BPJ", General Service "GSJ" — confirmed
 * across every real sample seen in this module. Used to split Parts/Labour/
 * TGLOSS revenue by GS vs BP without needing isBp from roInfoByRo (which
 * Labour Sales/Part Sale rows can't rely on — see this module's top doc
 * comment on why their SA lookup uses the wider roCloseSaMap instead). */
function isBpRo(ro: string): boolean {
  return ro.startsWith("BPJ");
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

/** Service Info's date columns are month-first (MM/DD/YYYY — confirmed in
 * docs/data-sourcing-reference.md, unlike SSRV089's day-first "Invoice Doc
 * Date"), paired with an "HH:MM" time column. The year is sometimes 2
 * digits instead of 4 (e.g. "1/10/26" — confirmed 2026-10-23: of 1,428 real
 * October EM60 ROs, 409 used this exact shorter form, all otherwise
 * well-formed — without handling it, OTD silently couldn't be computed for
 * ~29% of them). A 2-digit year is assumed 20YY, same convention used
 * elsewhere in this codebase (e.g. labour-sales/parse.ts's date parsing).
 * Returns minutes-since-epoch (UTC, no timezone meaning of its own — only
 * ever used to diff two values parsed the same way) or null if either half
 * isn't readable. */
function parseServiceInfoDateTime(dateStr: unknown, timeStr: unknown): number | null {
  const dm = normalizeText(dateStr).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  const tm = normalizeText(timeStr).match(/^(\d{1,2}):(\d{2})$/);
  if (!dm || !tm) return null;
  const month = Number(dm[1]);
  const day = Number(dm[2]);
  const year = dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3]);
  const hour = Number(tm[1]);
  const minute = Number(tm[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  return Date.UTC(year, month - 1, day, hour, minute) / 60_000;
}

/** Same date parsing as parseServiceInfoDateTime, date portion only — for
 * Same Day Delivery, which only needs calendar-day equality, not a
 * duration. Returns "YYYY-MM-DD" or null. */
function parseServiceInfoDate(dateStr: unknown): string | null {
  const dm = normalizeText(dateStr).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!dm) return null;
  const month = Number(dm[1]);
  const day = Number(dm[2]);
  const year = dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseMmDdYy(dateStr: unknown): { year: number; month: number; day: number } | null {
  const dm = normalizeText(dateStr).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!dm) return null;
  const month = Number(dm[1]);
  const day = Number(dm[2]);
  const year = dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** BP's Promise Delivery Date + Time (separate columns, time as zero-padded
 * "HHMM" with no colon — see PROMISE_DELIVERY_TIME_COLUMN's doc comment).
 * Minutes since epoch, or null if either side didn't parse. */
function parsePromiseDeliveryAt(dateValue: unknown, timeValue: unknown): number | null {
  const d = parseMmDdYy(dateValue);
  const tm = normalizeText(timeValue).match(/^(\d{2})(\d{2})$/);
  if (!d || !tm) return null;
  const hour = Number(tm[1]);
  const minute = Number(tm[2]);
  if (hour > 23 || minute > 59) return null;
  return Date.UTC(d.year, d.month - 1, d.day, hour, minute) / 60_000;
}

/** "MM/DD/YYYY HH:MM" combined date+time — NINETH_SMS_SEND_DT's own format
 * (space-separated, colon time), distinct from every other date/time column
 * in this module. Minutes since epoch, or null if unparseable/missing. */
function parseCombinedDateTime(value: unknown): number | null {
  const s = normalizeText(value);
  const spaceIdx = s.indexOf(" ");
  if (spaceIdx < 0) return null;
  const d = parseMmDdYy(s.slice(0, spaceIdx));
  const tm = s.slice(spaceIdx + 1).match(/^(\d{1,2}):(\d{2})$/);
  if (!d || !tm) return null;
  const hour = Number(tm[1]);
  const minute = Number(tm[2]);
  if (hour > 23 || minute > 59) return null;
  return Date.UTC(d.year, d.month - 1, d.day, hour, minute) / 60_000;
}

export type CloseSaDailyMetrics = {
  roCount: number;
  /** Every distinct Vin no for this SA's ROs that day — kept as the actual
   * list (not just a count) so a period rollup can union several days'
   * lists into a true distinct-vehicles count instead of summing daily
   * counts (see aggregate.ts). */
  vehicleVins: string[];
  jobDescCounts: Record<string, number>;
  wheelBalancingCount: number;
  wheelAlignmentCount: number;
  brakeSkimmingCount: number;
  evaporatorCleaningCount: number;
  vasBillRevenue: number;
  jobTypeCounts: Record<string, number>;
  payTypeCounts: Record<string, number>;
  amcCount: number;
  fmscCount: number;
  emCount: number;
  /** Distinct ROs flagged EM60 specifically (EM90/EM120 excluded, at the
   * user's request). Always paired with a Periodic Maintenance job line. */
  em60Count: number;
  /** Of those EM60 ROs, how many had Job Open→Invoice at or under 60
   * minutes (EM60_TARGET_MINUTES) — On-Time Delivery. A duration that
   * couldn't be computed (unreadable date/time) counts toward em60Count but
   * not here, same "don't guess" convention as the rest of this module. */
  em60OnTimeCount: number;
  appointmentCount: number;
  walkinCount: number;
  bpPotentialCount: number;
  labourRevenueBefore: number;
  labourRevenueAfter: number;
  soldHours: number;
  overTargetTotal: number;
  partsRevenue: number;
  partsMatchedRoCount: number;
  engineFlushCount: number;
  injectorCleanerCount: number;
  syntheticOilLtrs: number;
  brakeCleaningCount: number;
  diyCount: number;
  diyRevenue: number;
  externalSales: number;
  tyreCount: number;
  batteryCount: number;
  mechCareCount: number;
  brakeCleaningLabourCount: number;
  /** Distinct ROs with at least one TGLOSS-priced job code — "pitched" means
   * sold here (confirmed with the user: we can only measure what was
   * actually billed, not an offered-and-declined pitch). */
  tglossPitchedRoCount: number;
  /** Distinct ROs with a Periodic Maintenance job line, any EM status — the
   * denominator for EM-to-PM %. */
  pmRoCount: number;
  /** Job Open Date = Invoice Date (same calendar day), any RO — distinct
   * from EM60 OTD's 60-minute window. A date pair that didn't parse counts
   * toward roCount but not here (same convention as em60OnTimeCount). */
  sameDayDeliveryCount: number;
  /** Parts/Labour/TGLOSS revenue, BP ROs only (RO prefix "BPJ") — the
   * existing *Revenue fields above stay GS+BP combined; these are the BP
   * slice for BP's own Parts/Service/TGLOSS Gentani ratios. */
  bpLabourRevenue: number;
  bpPartsRevenue: number;
  bpTglossRevenue: number;
  /** {"1.Grooming Repair": n, ...} — BP Rep Type's 5 real values, verbatim. */
  bpRepairTypeCounts: Record<string, number>;
  bpFinalInvoiceAmount: number;
  bpEstimateAmount: number;
  bpRoCount: number;
  /** Distinct BP Work Order numbers (workOrdNo) — BP SMB Utilization %'s
   * numerator (2026-10-24, at the user's request: unique Work Order ÷ unique
   * RO). Not every RO gets a Work Order created, so always ≤ bpRoCount. */
  bpWorkOrderCount: number;
  /** BP ROs where both Promise Delivery Date/Time and the handover SMS
   * (NINETH_SMS_SEND_DT — confirmed 2026-10-24 to track within minutes of
   * Invoice Date, i.e. the actual handover moment) parsed — denominator for
   * BP OTD%. Real coverage is ~87% (checked CO01A, Oct 2026), so this is
   * usually under bpRoCount. */
  bpOtdEligibleCount: number;
  /** Of bpOtdEligibleCount, how many had the handover land inside [Promise
   * − 24h, Promise] — confirmed with the user 2026-10-24: arriving more than
   * 24h before the promise fails this just like arriving late does. */
  bpOtdOnTimeCount: number;
};

function emptyMetrics(): CloseSaDailyMetrics {
  return {
    roCount: 0,
    vehicleVins: [],
    jobDescCounts: {},
    wheelBalancingCount: 0,
    wheelAlignmentCount: 0,
    brakeSkimmingCount: 0,
    evaporatorCleaningCount: 0,
    vasBillRevenue: 0,
    jobTypeCounts: {},
    payTypeCounts: {},
    amcCount: 0,
    fmscCount: 0,
    emCount: 0,
    em60Count: 0,
    em60OnTimeCount: 0,
    appointmentCount: 0,
    walkinCount: 0,
    bpPotentialCount: 0,
    labourRevenueBefore: 0,
    labourRevenueAfter: 0,
    soldHours: 0,
    overTargetTotal: 0,
    partsRevenue: 0,
    partsMatchedRoCount: 0,
    engineFlushCount: 0,
    injectorCleanerCount: 0,
    syntheticOilLtrs: 0,
    brakeCleaningCount: 0,
    diyCount: 0,
    diyRevenue: 0,
    externalSales: 0,
    tyreCount: 0,
    batteryCount: 0,
    mechCareCount: 0,
    brakeCleaningLabourCount: 0,
    tglossPitchedRoCount: 0,
    pmRoCount: 0,
    sameDayDeliveryCount: 0,
    bpLabourRevenue: 0,
    bpPartsRevenue: 0,
    bpTglossRevenue: 0,
    bpRepairTypeCounts: {},
    bpFinalInvoiceAmount: 0,
    bpEstimateAmount: 0,
    bpRoCount: 0,
    bpWorkOrderCount: 0,
    bpOtdEligibleCount: 0,
    bpOtdOnTimeCount: 0,
  };
}

function bump(map: Record<string, number>, key: string, by = 1): void {
  if (!key) return;
  map[key] = (map[key] ?? 0) + by;
}

/** Same price-list lookup as service-info/parse.ts's vasRevenueForRow — kept
 * as its own copy here, same reasoning vas-revenue-real/compute.ts already
 * documented for its own copy (that parser's version is tangled up with its
 * own per-row loop / accessories-exclusion timing). */
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

type RoInfo = {
  closeSaName: string;
  vin: string;
  jobType: string;
  payType: string;
  amc: boolean;
  fmsc: boolean;
  /** Raw EM Flag value — "NO", "EM60", "EM90", or "EM120". */
  emFlag: string;
  /** Job Open→Invoice duration in minutes, for an EM60 RO only (null for
   * every other RO, and for an EM60 RO whose date/time fields didn't parse). */
  em60DurationMinutes: number | null;
  bpPotential: boolean;
  appointment: boolean | null; // null = neither flag present
  bpEstAmt: number;
  bpFinalInvAmt: number;
  bpRepType: string;
  /** Job Open Date = Invoice Date — null when either side didn't parse
   * (counts toward roCount but not sameDayDeliveryCount, same "don't guess"
   * convention as em60DurationMinutes). */
  sameDayDelivery: boolean | null;
  isBp: boolean;
  /** BP's own Work Order number — "" when absent (not every RO gets one). */
  workOrdNo: string;
  /** Promise Delivery Date+Time, minutes since epoch — null if either side
   * didn't parse (BP only; always null on a GS row, no such columns). */
  bpPromiseAt: number | null;
  /** NINETH_SMS_SEND_DT ("vehicle ready" SMS), minutes since epoch — null if
   * unparseable/missing (BP only). */
  bpHandoverAt: number | null;
};

function readRoInfo(row: Record<string, unknown>, isBp: boolean): RoInfo {
  const appointmentRaw = normalizeText(row[APPOINTMENT_WALKIN_COLUMN]).toUpperCase();
  const emFlag = normalizeText(row[EM_FLAG_COLUMN]).toUpperCase();
  const em60DurationMinutes =
    emFlag === EM60_VALUE
      ? (() => {
          const open = parseServiceInfoDateTime(row[JOB_OPEN_DATE_COLUMN], row[JOB_OPEN_TIME_COLUMN]);
          const invoice = parseServiceInfoDateTime(row[INVOICE_DATE_COLUMN], row[INVOICE_TIME_COLUMN]);
          return open !== null && invoice !== null ? invoice - open : null;
        })()
      : null;
  const openDate = parseServiceInfoDate(row[JOB_OPEN_DATE_COLUMN]);
  const invoiceDate = parseServiceInfoDate(row[INVOICE_DATE_COLUMN]);
  const sameDayDelivery = openDate !== null && invoiceDate !== null ? openDate === invoiceDate : null;
  return {
    closeSaName: normalizeCloseSaName(row[CLOSE_SA_NAME_COLUMN]),
    vin: normalizeText(row[VIN_COLUMN]),
    jobType: normalizeText(row[JOB_TYPE_COLUMN]),
    payType: normalizeText(row[PAY_TYPE_COLUMN]),
    amc: normalizeText(row[AMC_FLAG_COLUMN]).toUpperCase() === "Y",
    fmsc: normalizeText(row[FMSC_FLAG_COLUMN]).toUpperCase() === "Y",
    emFlag,
    em60DurationMinutes,
    bpPotential: normalizeText(row[BP_POTENTIAL_COLUMN]).toUpperCase() === "Y",
    appointment: appointmentRaw ? appointmentRaw === APPOINTMENT_VALUE : null,
    bpEstAmt: parseAmount(row[BP_EST_AMT_COLUMN]),
    bpFinalInvAmt: parseAmount(row[BP_FINAL_INV_AMT_COLUMN]),
    bpRepType: normalizeText(row[BP_REP_TYPE_COLUMN]),
    sameDayDelivery,
    isBp,
    workOrdNo: normalizeText(row[WORK_ORDER_NO_COLUMN]),
    bpPromiseAt: parsePromiseDeliveryAt(row[PROMISE_DELIVERY_DATE_COLUMN], row[PROMISE_DELIVERY_TIME_COLUMN]),
    bpHandoverAt: parseCombinedDateTime(row[NINTH_SMS_SEND_DT_COLUMN]),
  };
}

/**
 * Computes one branch/date's Close SA Analytics from that day's raw rows.
 * `serviceInfoRows`/`serviceInfoBpRows` are this branch/date's GS/BP Service
 * Info rows, `labourSalesRows` this date's Labour Sales rows (branch-wide —
 * Labour Sales carries no branch column of its own, see its parser), and
 * `partSaleRows` this branch/date's Part Sale rows. `tier` is the branch's
 * city tier for VAS price-list pricing (null skips VAS revenue entirely —
 * same as the existing price-list calculation).
 */
export function computeCloseSaAnalytics(
  serviceInfoRows: Record<string, unknown>[],
  serviceInfoBpRows: Record<string, unknown>[],
  labourSalesRows: Record<string, unknown>[],
  partSaleRows: Record<string, unknown>[],
  tier: "A" | "B" | null,
  /** RO → Close SA name, from a wider window than this date's own Service
   * Info rows — see this module's doc comment above. Only Labour Sales /
   * Part Sale attribution uses this; everything else uses `roInfoByRo`. */
  roCloseSaMap: Map<string, string>,
  /** Every Part Sale row (any date, this branch's whole history) whose
   * RefDocNo matches one of TODAY's closing ROs (the ROs in
   * serviceInfoRows/serviceInfoBpRows) — used only for tyre/battery.
   * Confirmed with the user 2026-10-28: unlike every other Part-Sale-derived
   * metric above (scoped to this day's own Part Sale rows, i.e. "parts
   * billed this day"), tyre/battery should reflect "ROs this SA closed this
   * day", since a part is routinely billed before its job physically
   * closes — unlike those other metrics, this is recomputed fresh from the
   * RO's full Part Sale history every time this date is recomputed, so it
   * never needs a separate catch-up once the RO closes (see
   * close-sa-analytics/recompute.ts). */
  partSaleRowsForTyreBattery: Record<string, unknown>[]
): Map<string, CloseSaDailyMetrics> {
  const byCloseSa = new Map<string, CloseSaDailyMetrics>();
  const metricsFor = (name: string): CloseSaDailyMetrics => {
    let m = byCloseSa.get(name);
    if (!m) {
      m = emptyMetrics();
      byCloseSa.set(name, m);
    }
    return m;
  };

  // --- Pass 1: group Service Info (GS+BP) rows by RO, read RO-level info
  // once per RO, count job-desc/VAS rows per row.
  const roInfoByRo = new Map<string, RoInfo>(); // normalizeRo(Job Order No) -> info
  const allSiRows: { row: Record<string, unknown>; isBp: boolean }[] = [
    ...serviceInfoRows.map((row) => ({ row, isBp: false })),
    ...serviceInfoBpRows.map((row) => ({ row, isBp: true })),
  ];

  for (const { row, isBp } of allSiRows) {
    const ro = normalizeRo(row[JOB_ORDER_NO_COLUMN]);
    if (!ro) continue;
    if (!roInfoByRo.has(ro)) roInfoByRo.set(ro, readRoInfo(row, isBp));
  }

  // An RO's EM Flag is DMS-set independently of its Job Desc lines, and real
  // data has shown it can be populated (e.g. EM60) on an RO that's actually
  // PDI, not Periodic Maintenance (confirmed 2026-10-24, SIVADAS O/TI01A: 4
  // "PRE-DELIVERY SERVICE - INSP"-only ROs carried EM Flag=EM60). So EM/EM60
  // only count an RO when it also has at least one real PM job line —
  // computed up front here so Pass 1 below can gate on it.
  const roHasPmLine = new Set<string>();
  for (const { row } of allSiRows) {
    const ro = normalizeRo(row[JOB_ORDER_NO_COLUMN]);
    if (ro && PM_JOB_DESC_PATTERN.test(normalizeText(row[JOB_DESC_COLUMN]))) roHasPmLine.add(ro);
  }

  // Per-SA RO-level aggregates (counted once per RO, not per row).
  const vehiclesBySa = new Map<string, Set<string>>();
  const roCountBySa = new Map<string, Set<string>>();
  const bpRoCountBySa = new Map<string, Set<string>>();
  const bpWorkOrdersBySa = new Map<string, Set<string>>();
  for (const [ro, info] of roInfoByRo) {
    if (!info.closeSaName) continue;
    const m = metricsFor(info.closeSaName);

    if (!roCountBySa.has(info.closeSaName)) roCountBySa.set(info.closeSaName, new Set());
    roCountBySa.get(info.closeSaName)!.add(ro);

    if (info.vin) {
      if (!vehiclesBySa.has(info.closeSaName)) vehiclesBySa.set(info.closeSaName, new Set());
      vehiclesBySa.get(info.closeSaName)!.add(info.vin);
    }

    bump(m.jobTypeCounts, info.jobType);
    bump(m.payTypeCounts, info.payType);
    if (info.amc) m.amcCount++;
    if (info.fmsc) m.fmscCount++;
    // Fixed 2026-10-23 — this previously checked EM_FLAG_COLUMN === "Y",
    // which real data never contains (see EM60_VALUE's doc comment above),
    // so emCount had silently been 0 for every SA since this feature
    // shipped. Any non-"NO", non-blank value is a real EM tier (60/90/120).
    // Fixed 2026-10-24 — also requires roHasPmLine (see above): an EM Flag
    // without a real PM job line on the RO isn't a genuine EM visit.
    if (roHasPmLine.has(ro) && info.emFlag && info.emFlag !== "NO") m.emCount++;
    if (roHasPmLine.has(ro) && info.emFlag === EM60_VALUE) {
      m.em60Count++;
      if (info.em60DurationMinutes !== null && info.em60DurationMinutes <= EM60_TARGET_MINUTES) m.em60OnTimeCount++;
    }
    if (info.bpPotential) m.bpPotentialCount++;
    if (info.appointment === true) m.appointmentCount++;
    else if (info.appointment === false) m.walkinCount++;
    if (info.sameDayDelivery === true) m.sameDayDeliveryCount++;

    if (info.isBp) {
      if (!bpRoCountBySa.has(info.closeSaName)) bpRoCountBySa.set(info.closeSaName, new Set());
      bpRoCountBySa.get(info.closeSaName)!.add(ro);
      m.bpFinalInvoiceAmount += info.bpFinalInvAmt;
      m.bpEstimateAmount += info.bpEstAmt;
      if (info.bpRepType) bump(m.bpRepairTypeCounts, info.bpRepType);
      if (info.workOrdNo) {
        if (!bpWorkOrdersBySa.has(info.closeSaName)) bpWorkOrdersBySa.set(info.closeSaName, new Set());
        bpWorkOrdersBySa.get(info.closeSaName)!.add(info.workOrdNo);
      }
      if (info.bpPromiseAt !== null && info.bpHandoverAt !== null) {
        m.bpOtdEligibleCount++;
        const promiseDayStart = Math.floor(info.bpPromiseAt / MINUTES_PER_DAY) * MINUTES_PER_DAY;
        const windowStart = promiseDayStart - BP_OTD_WINDOW_DAYS * MINUTES_PER_DAY;
        if (info.bpHandoverAt <= info.bpPromiseAt && info.bpHandoverAt >= windowStart) {
          m.bpOtdOnTimeCount++;
        }
      }
    }
  }
  for (const [name, set] of roCountBySa) metricsFor(name).roCount = set.size;
  for (const [name, set] of vehiclesBySa) metricsFor(name).vehicleVins = [...set];
  for (const [name, set] of bpRoCountBySa) metricsFor(name).bpRoCount = set.size;
  for (const [name, set] of bpWorkOrdersBySa) metricsFor(name).bpWorkOrderCount = set.size;

  // Brake Skimming / PM / TGLOSS-pitched are per distinct RO among matching
  // rows, not per row — tracked separately from the per-row loop.
  const brakeSkimmingRosBySa = new Map<string, Set<string>>();
  const pmRosBySa = new Map<string, Set<string>>();
  const tglossPitchedRosBySa = new Map<string, Set<string>>();

  // --- Pass 2: per-row Job Desc / VAS counts, attributed to the row's RO's Close SA.
  for (const { row } of allSiRows) {
    const ro = normalizeRo(row[JOB_ORDER_NO_COLUMN]);
    const info = roInfoByRo.get(ro);
    if (!info || !info.closeSaName) continue;
    const m = metricsFor(info.closeSaName);

    const desc = normalizeText(row[JOB_DESC_COLUMN]);
    if (desc) bump(m.jobDescCounts, desc);
    if (desc === WHEEL_BALANCING_DESC) m.wheelBalancingCount++;
    else if (desc === WHEEL_ALIGNMENT_DESC) m.wheelAlignmentCount++;
    else if (desc === MECH_CARE_DESC) m.mechCareCount++;
    else if (isBrakeSkimmingDesc(desc)) {
      if (!brakeSkimmingRosBySa.has(info.closeSaName)) brakeSkimmingRosBySa.set(info.closeSaName, new Set());
      brakeSkimmingRosBySa.get(info.closeSaName)!.add(ro || `row-${JSON.stringify(row).length}`);
    } else if (!info.isBp && desc === EVAPORATOR_CLEANING_DESC) {
      // GS only — same as the branch-level calculation.
      m.evaporatorCleaningCount++;
    }

    if (ro && PM_JOB_DESC_PATTERN.test(desc)) {
      if (!pmRosBySa.has(info.closeSaName)) pmRosBySa.set(info.closeSaName, new Set());
      pmRosBySa.get(info.closeSaName)!.add(ro);
    }
    const jobCode = normalizeText(row[JOB_CODE_COLUMN]);
    if (ro && VAS_PRICE_BY_JOB_CODE.has(jobCode)) {
      if (!tglossPitchedRosBySa.has(info.closeSaName)) tglossPitchedRosBySa.set(info.closeSaName, new Set());
      tglossPitchedRosBySa.get(info.closeSaName)!.add(ro);
    }
  }
  for (const [name, set] of brakeSkimmingRosBySa) metricsFor(name).brakeSkimmingCount = set.size;
  for (const [name, set] of pmRosBySa) metricsFor(name).pmRoCount = set.size;
  for (const [name, set] of tglossPitchedRosBySa) metricsFor(name).tglossPitchedRoCount = set.size;

  // --- Labour Sales: join by RO (undashed), sum labour revenue/hours per
  // line, Over Target once per RO. Close SA comes from roCloseSaMap (a wider
  // window), not roInfoByRo (this day only) — see module doc comment above.
  const overTargetSeenRo = new Set<string>(); // "closeSaName|ro" — Over Target repeats per line, add once per RO
  const labourByRoAndJobCode = new Map<string, number>(); // ro|jobCode -> summed Sub Total After Discount, for the VAS real-revenue join below
  for (const row of labourSalesRows) {
    const ro = normalizeRo(row[LS_JOB_NO_COLUMN]);
    if (!ro) continue;
    const jobCode = normalizeText(row[LS_JOB_CODE_COLUMN]);
    const after = parseAmount(row[LS_SUB_TOTAL_AFTER_COLUMN]);
    labourByRoAndJobCode.set(ro + "|" + jobCode, (labourByRoAndJobCode.get(ro + "|" + jobCode) ?? 0) + after);

    const closeSaName = roCloseSaMap.get(ro);
    if (!closeSaName) continue;
    const m = metricsFor(closeSaName);
    m.labourRevenueBefore += parseAmount(row[LS_SUB_TOTAL_BEFORE_COLUMN]);
    m.labourRevenueAfter += after;
    m.soldHours += parseAmount(row[LS_SOLD_HOUR_COLUMN]);
    if (BRAKE_CLEANING_LABOUR_CODES.has(jobCode)) m.brakeCleaningLabourCount++;
    if (isBpRo(ro)) m.bpLabourRevenue += after;

    const seenKey = closeSaName + "|" + ro;
    if (!overTargetSeenRo.has(seenKey)) {
      overTargetSeenRo.add(seenKey);
      const overTargetRaw = normalizeText(row[LS_OVER_TARGET_COLUMN]);
      if (overTargetRaw) m.overTargetTotal += parseAmount(row[LS_OVER_TARGET_COLUMN]);
    }
  }

  // --- VAS Bill revenue: real billed amount (Service Info row matched to a
  // Labour Sales row by RO + Job Code — same join as vas-revenue-real/
  // compute.ts) when available, price-list fallback otherwise. Per matching
  // Service Info row, attributed to that row's RO's Close SA.
  for (const { row } of allSiRows) {
    const jobCode = normalizeText(row[JOB_CODE_COLUMN]);
    if (!VAS_PRICE_BY_JOB_CODE.has(jobCode)) continue;
    const ro = normalizeRo(row[JOB_ORDER_NO_COLUMN]);
    const info = roInfoByRo.get(ro);
    if (!info || !info.closeSaName) continue;
    const m = metricsFor(info.closeSaName);

    const matched = labourByRoAndJobCode.get(ro + "|" + jobCode);
    const value = matched !== undefined ? matched : vasPriceListValue(jobCode, normalizeText(row[SERIES_COLUMN]), tier);
    m.vasBillRevenue += value;
    if (info.isBp) m.bpTglossRevenue += value;
  }

  // --- Part Sale: join by RefDocNo (dash-stripped) to the RO. Confirmed
  // ~65-68% real match rate, never assumed to be exhaustive. Close SA comes
  // from roCloseSaMap (a wider window), not roInfoByRo (this day only) —
  // see module doc comment above.
  const matchedRosBySa = new Map<string, Set<string>>();
  for (const row of partSaleRows) {
    const refDoc = normalizeRo(row[PS_REF_DOC_NO_COLUMN]);
    if (!refDoc) continue;
    const closeSaName = roCloseSaMap.get(refDoc);
    if (!closeSaName) continue;
    const m = metricsFor(closeSaName);

    if (!matchedRosBySa.has(closeSaName)) matchedRosBySa.set(closeSaName, new Set());
    matchedRosBySa.get(closeSaName)!.add(refDoc);

    const netAmnt = toQty(row[PS_NET_AMNT_COLUMN]);
    m.partsRevenue += netAmnt;
    if (isBpRo(refDoc)) m.bpPartsRevenue += netAmnt;

    const part = normalizePart(row[PS_PART_NO_COLUMN]);
    const qty = toQty(row[PS_SALE_QTY_COLUMN]);
    if (ENGINE_FLUSH_PARTS.includes(part)) m.engineFlushCount += qty;
    else if (INJECTOR_CLEANER_PARTS.includes(part)) m.injectorCleanerCount += qty;
    else if (SYNTHETIC_OIL_PARTS.includes(part)) m.syntheticOilLtrs += qty / 10;
    else if (BRAKE_CLEANING_SPRAY_PARTS.includes(part)) m.brakeCleaningCount += qty;

    if (part.toUpperCase().startsWith(DIY_PART_PREFIX)) {
      m.diyCount += qty;
      m.diyRevenue += toQty(row[PS_NET_AMNT_COLUMN]);
    }

    const billNo = normalizePart(row[PS_BILL_NO_COLUMN]);
    const customerName = normalizePart(row[PS_CUSTOMER_NAME_COLUMN]);
    if (isExternalSalesRow(billNo, normalizePart(row[PS_REF_DOC_NO_COLUMN]), alwaysEligible) && !isExcludedCustomer(customerName)) {
      m.externalSales += toQty(row[PS_NET_AMNT_COLUMN]);
    }
  }
  for (const [name, set] of matchedRosBySa) metricsFor(name).partsMatchedRoCount = set.size;

  // --- Tyre / Battery: scoped to the ROs that CLOSED today, not to "parts
  // billed today" — see partSaleRowsForTyreBattery's doc comment above.
  for (const row of partSaleRowsForTyreBattery) {
    const refDoc = normalizeRo(row[PS_REF_DOC_NO_COLUMN]);
    if (!refDoc) continue;
    const closeSaName = roCloseSaMap.get(refDoc);
    if (!closeSaName) continue;
    const m = metricsFor(closeSaName);
    const part = normalizePart(row[PS_PART_NO_COLUMN]);
    const qty = toQty(row[PS_SALE_QTY_COLUMN]);
    if (part.toUpperCase().startsWith(TYRE_PART_PREFIX)) m.tyreCount += qty;
    if (part.toUpperCase().startsWith(BATTERY_PART_PREFIX)) m.batteryCount += qty;
  }

  return byCloseSa;
}
