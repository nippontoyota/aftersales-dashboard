export const CE_STATUSES = [
  "New",
  "Attempted",
  "Connected",
  "Follow-up",
  "Appointment booked",
  "Converted",
  "Not interested",
  "Unreachable",
] as const;

export type CeStatus = (typeof CE_STATUSES)[number];
export type CeCategory = "hot" | "warm" | "cold";
export const CE_AVF_CATEGORIES = ["red", "yellow", "green", "unavailable"] as const;
export type CeAvfCategory = (typeof CE_AVF_CATEGORIES)[number];
export const CE_FOLLOW_UP_FILTERS = ["due", "upcoming", "none"] as const;
export type CeFollowUpFilter = (typeof CE_FOLLOW_UP_FILTERS)[number];

export function calculateCeAvf(nMileage: number, n1Mileage: number): number {
  return (nMileage - n1Mileage) / 10_000;
}

export function ceAvfCategory(avf: number | null): CeAvfCategory {
  if (avf === null) return "unavailable";
  if (avf < 1) return "red";
  if (avf <= 1.7) return "yellow";
  return "green";
}

export const CE_CALL_STATUSES = ["connected", "not_connected"] as const;
export type CeCallStatus = (typeof CE_CALL_STATUSES)[number];

export const CONNECTED_OUTCOMES = [
  "Appointment booked",
  "Call back later",
  "Service due later",
  "Needs estimate/details",
  "Already serviced with us",
  "Serviced elsewhere",
  "Vehicle sold",
  "Customer complaint",
  "Not interested",
] as const;

export const NOT_CONNECTED_OUTCOMES = [
  "Ringing, no answer",
  "Switched off",
  "Call forwarding",
  "Line busy",
  "Out of coverage",
  "Invalid/wrong number",
] as const;

export type CeConnectedOutcome = (typeof CONNECTED_OUTCOMES)[number];
export type CeNotConnectedOutcome = (typeof NOT_CONNECTED_OUTCOMES)[number];
export type CeCallOutcome = CeConnectedOutcome | CeNotConnectedOutcome;

export const TERMINAL_CE_STATUSES = new Set<CeStatus>(["Converted", "Not interested", "Unreachable"]);

const FOLLOW_UP_OUTCOMES = new Set<CeCallOutcome>([
  "Appointment booked",
  "Call back later",
  "Service due later",
  "Needs estimate/details",
  "Customer complaint",
  ...NOT_CONNECTED_OUTCOMES.filter((outcome) => outcome !== "Invalid/wrong number"),
]);

export function callStatusLabel(status: CeCallStatus): string {
  return status === "connected" ? "Connected" : "Not connected";
}

export function outcomeNeedsDate(outcome: string): boolean {
  return FOLLOW_UP_OUTCOMES.has(outcome as CeCallOutcome);
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseCeDateInput(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  return isValidIsoDate(iso) ? iso : null;
}

export function formatCeDate(value: string): string {
  return isValidIsoDate(value) ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : "—";
}

export function formatCeDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date).replace(",", "");
}

export function validateCeCallDetails(input: {
  callStatus: string;
  outcome: string;
  followUpDate: string | null;
  today?: string;
}): string | null {
  if (!CE_CALL_STATUSES.includes(input.callStatus as CeCallStatus)) return "Choose whether the call connected.";
  const outcomes = input.callStatus === "connected" ? CONNECTED_OUTCOMES : NOT_CONNECTED_OUTCOMES;
  if (!outcomes.includes(input.outcome as never)) return "Choose a valid outcome for this call status.";
  if (outcomeNeedsDate(input.outcome) && !input.followUpDate) return "Choose the applicable appointment or follow-up date.";
  if (input.followUpDate && !isValidIsoDate(input.followUpDate)) return "Choose a valid appointment or follow-up date.";
  if (input.followUpDate && input.today && input.followUpDate <= input.today) return "Appointment and follow-up dates must be in the future.";
  return null;
}

export function deriveCeCallUpdate(input: {
  currentAttemptCount: number;
  callStatus: string;
  outcome: string;
  followUpDate: string | null;
  today?: string;
}): {
  attemptCount: number;
  callStatus: CeCallStatus;
  outcome: CeCallOutcome;
  status: CeStatus;
  nextFollowUpDate: string | null;
} {
  const error = validateCeCallDetails(input);
  if (error) throw new Error(error);
  const callStatus = input.callStatus as CeCallStatus;
  const outcome = input.outcome as CeCallOutcome;
  const attemptCount = Math.min(5, Math.max(0, input.currentAttemptCount) + 1);
  let status: CeStatus;

  if (callStatus === "not_connected") {
    status = outcome === "Invalid/wrong number" || attemptCount === 5 ? "Unreachable" : "Attempted";
  } else if (outcome === "Appointment booked") {
    status = "Appointment booked";
  } else if (["Call back later", "Service due later", "Needs estimate/details", "Customer complaint"].includes(outcome)) {
    status = "Follow-up";
  } else if (outcome === "Already serviced with us") {
    status = "Converted";
  } else {
    status = "Not interested";
  }

  return {
    attemptCount,
    callStatus,
    outcome,
    status,
    nextFollowUpDate: TERMINAL_CE_STATUSES.has(status) ? null : input.followUpDate,
  };
}

export function indiaDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function dateAgeInDays(reportDate: string, today: string): number {
  const milliseconds = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${reportDate}T00:00:00Z`);
  return Math.floor(milliseconds / 86_400_000);
}

export function categoryForAge(age: number): CeCategory {
  if (age <= 364) return "hot";
  if (age <= 730) return "warm";
  return "cold";
}

export function nextIndiaMidnight(nowMs = Date.now()): number {
  const indiaOffsetMs = 330 * 60_000;
  const indiaNow = new Date(nowMs + indiaOffsetMs);
  return Date.UTC(indiaNow.getUTCFullYear(), indiaNow.getUTCMonth(), indiaNow.getUTCDate() + 1) - indiaOffsetMs;
}

function addMonths(dateIso: string, months: number): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + months, day)).toISOString().slice(0, 10);
}

function addDays(dateIso: string, days: number): string {
  return new Date(Date.parse(`${dateIso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

// TKM's own "months or km, whichever first" due-date logic (reverse-
// engineered against 1,852 real N-9 rows across 3 days — see
// project_mrs_n9_system.md) needs TKM's own schedule table to know which
// milestone applies next; we don't have that. This is our proxy for
// vehicles with no known TKM milestone: a fixed 6-month / 10,000km window
// from the last known visit, whichever comes first — not an attempt to
// replicate TKM's exact per-model schedule.
const CE_DUE_MONTHS = 6;
const CE_DUE_KM = 10_000;

// Below this, a vehicle is either barely driven or the mileage/date on
// file is a placeholder (confirmed against real N-9 data: legitimate
// rates run ~20-200+ km/day — see project_mrs_n9_system.md's outlier
// analysis) — too unreliable to project a km-based date from at all.
const CE_MIN_PLAUSIBLE_KM_PER_DAY = 1;

/** The mileage rate used to project the km leg forward: this vehicle's
 * own recent N-to-N1 rate when a second visit exists (closer to what the
 * real reverse-engineered TKM formula's residual variance suggested
 * drives it), falling back to its lifetime rate (N mileage over its age
 * since salesDate, matching TKM's own formula exactly) when there's only
 * one visit on record. Null when neither is a plausible rate (see
 * CE_MIN_PLAUSIBLE_KM_PER_DAY) rather than returning a near-zero rate
 * that would project the km leg centuries into the future. */
function ceMileageRate(input: {
  salesDate: string;
  nReportDate: string;
  nMileage: number;
  n1ReportDate: string | null;
  n1Mileage: number | null;
}): number | null {
  if (input.n1ReportDate && input.n1Mileage !== null) {
    const days = dateAgeInDays(input.n1ReportDate, input.nReportDate);
    if (days > 0) {
      const rate = (input.nMileage - input.n1Mileage) / days;
      if (rate >= CE_MIN_PLAUSIBLE_KM_PER_DAY) return rate;
    }
  }
  const lifetimeDays = dateAgeInDays(input.salesDate, input.nReportDate);
  if (lifetimeDays <= 0) return null;
  const lifetimeRate = input.nMileage / lifetimeDays;
  return lifetimeRate >= CE_MIN_PLAUSIBLE_KM_PER_DAY ? lifetimeRate : null;
}

/** Our due-date proxy (see CE_DUE_MONTHS/CE_DUE_KM above) for a lead with
 * no TKM-assigned milestone — never meant to override an actual
 * `icrop_recommended_date` when one is known for this vehicle's current
 * cycle; this is specifically for the vehicles no recent N-9 list has
 * covered, where that field will never exist. */
export function ceDueDate(input: {
  salesDate: string;
  nReportDate: string;
  nMileage: number;
  n1ReportDate: string | null;
  n1Mileage: number | null;
}): string {
  const monthsDue = addMonths(input.nReportDate, CE_DUE_MONTHS);
  const rate = ceMileageRate(input);
  if (rate === null) return monthsDue;

  const kmDueDays = CE_DUE_KM / rate;
  const kmDue = addDays(input.nReportDate, kmDueDays);

  // Compare as actual timestamps, not ISO strings — a string comparison
  // breaks the moment either side falls outside the normal 4-digit-year
  // range (JS renders those with a leading "+" and 6-digit year, which
  // sorts before any normal date lexicographically).
  return Date.parse(`${monthsDue}T00:00:00Z`) <= Date.parse(`${kmDue}T00:00:00Z`) ? monthsDue : kmDue;
}
