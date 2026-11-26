export const CE_STATUSES = [
  "New",
  "Attempted",
  "Connected",
  "Follow-up",
  "Appointment booked",
  "Converted",
  "Vehicle sold",
  "Serviced elsewhere",
  "Not interested",
  "Unreachable",
  "MRS follow-up already scheduled",
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

export type CeTimelineEntry = { label: "N" | "N-1" | "N-2"; date: string | null; dealer: string | null; mileage: number | null; source: "uio" | "service_info" };

/**
 * Merges the UIO/DMS-sourced N/N1/N2 anchors with this VIN's own GS
 * (periodic-maintenance) Service Info visits, so a vehicle whose N-1/N-2
 * TKM's own feed never recorded — but that we've serviced ourselves —
 * still shows a real N-1/N-2 instead of "—", with AVF computed from
 * whichever pair of dates actually wins out. Display-only: never written
 * back to ce_leads, so the due-date/AVF figures used elsewhere (MRS,
 * company-wide stats) keep using the stored chain, which the
 * Service-Info-link backfill/hook already keep correct on their own
 * terms. BP (Body & Paint) visits are deliberately excluded — this is
 * the periodic-maintenance timeline only, per the user's 2026-11-03
 * "we don't need to know bp uploads" scope.
 */
export function mergeCeServiceTimeline(input: {
  nReportDate: string;
  nMileage: number;
  nDealerCode: string;
  n1ReportDate: string | null;
  n1Mileage: number | null;
  n1DealerCode: string | null;
  n2ReportDate: string | null;
  n2Mileage: number | null;
  n2DealerCode: string | null;
  serviceInfoVisits: { date: string; branch: string; mileage: number | null }[];
}): CeTimelineEntry[] {
  type Candidate = { date: string; dealer: string | null; mileage: number | null; source: "uio" | "service_info" };
  const candidates: Candidate[] = [{ date: input.nReportDate, dealer: input.nDealerCode, mileage: input.nMileage, source: "uio" }];
  if (input.n1ReportDate) candidates.push({ date: input.n1ReportDate, dealer: input.n1DealerCode, mileage: input.n1Mileage, source: "uio" });
  if (input.n2ReportDate) candidates.push({ date: input.n2ReportDate, dealer: input.n2DealerCode, mileage: input.n2Mileage, source: "uio" });
  for (const visit of input.serviceInfoVisits) candidates.push({ date: visit.date, dealer: visit.branch, mileage: visit.mileage, source: "service_info" });

  // One entry per date — prefer whichever candidate actually carries a
  // mileage figure when the same visit shows up from both sources.
  const byDate = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const existing = byDate.get(candidate.date);
    if (!existing || (existing.mileage === null && candidate.mileage !== null)) byDate.set(candidate.date, candidate);
  }

  const merged = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const labels = ["N", "N-1", "N-2"] as const;
  return labels.map((label, i) => ({
    label,
    date: merged[i]?.date ?? null,
    dealer: merged[i]?.dealer ?? null,
    mileage: merged[i]?.mileage ?? null,
    source: merged[i]?.source ?? "uio",
  }));
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

export const TERMINAL_CE_STATUSES = new Set<CeStatus>(["Converted", "Vehicle sold", "Serviced elsewhere", "Not interested", "Unreachable", "MRS follow-up already scheduled"]);

/** TERMINAL_CE_STATUSES plus "Appointment booked" — every status where the
 * CE has already gotten what this catch-list is chasing (a contact, closed
 * one way or another) and the lead needs no further prompting from it.
 * Used to hard-exclude these from the MRS catch list (2026-11-03, at the
 * user's request) — unlike the main leads page's "due"/"upcoming" filter,
 * the MRS list has no other mode, so this is an unconditional exclusion,
 * not just one followUps option among others. */
export const CE_MRS_RESOLVED_STATUSES = new Set<CeStatus>([...TERMINAL_CE_STATUSES, "Appointment booked"]);

/** The status the "not even going to try them" shortcut sets (see
 * markCeMrsFollowUpAlreadyScheduled in store.ts) — shared here so the
 * bulk-upload path can recognize the same sentinel value in an Excel
 * "Outcome" cell without duplicating the literal string. */
export const CE_MRS_FOLLOW_UP_SCHEDULED_STATUS: CeStatus = "MRS follow-up already scheduled";

/** Every value selectable in the MRS bulk-upload sheet's "Outcome"
 * dropdown (2026-11-05) — every real call outcome plus the one shortcut
 * that isn't a call outcome at all. Call status (connected/not) is never
 * asked for separately in that sheet — it's fully recoverable from which
 * of the two outcome lists a value came from, since the two never share a
 * value (see resolveCeBulkOutcome below). */
export const CE_MRS_BULK_OUTCOME_OPTIONS = [...CONNECTED_OUTCOMES, ...NOT_CONNECTED_OUTCOMES, CE_MRS_FOLLOW_UP_SCHEDULED_STATUS] as const;

/** Same idea for Conquest's own bulk-upload sheet (2026-11-13) — every real
 * call outcome, minus the MRS-only shortcut, which doesn't apply here (a
 * conquest lead was never on an MRS list, so "MRS follow-up already
 * scheduled" isn't even a valid status for ce_conquest_workflow). Reuses
 * resolveCeBulkOutcome below for classification — its "mrs_follow_up_
 * scheduled" branch is simply never a legal choice for Conquest, same as
 * any other unrecognized value. */
export const CE_CONQUEST_BULK_OUTCOME_OPTIONS = [...CONNECTED_OUTCOMES, ...NOT_CONNECTED_OUTCOMES] as const;

export type CeMrsBulkOutcomeResolution =
  | { kind: "call"; callStatus: CeCallStatus; outcome: CeCallOutcome }
  | { kind: "mrs_follow_up_scheduled" }
  | { kind: "unrecognized" };

/** Classifies a value typed/picked into the bulk-upload sheet's Outcome
 * column. Trims and matches case-insensitively — Excel's dropdown can't
 * stop someone retyping over a cell, and a stray space or capitalization
 * slip shouldn't turn into a silent reject when the intent is obvious. */
export function resolveCeBulkOutcome(raw: string): CeMrsBulkOutcomeResolution {
  const value = raw.trim();
  const match = (list: readonly string[]) => list.find((item) => item.toLowerCase() === value.toLowerCase());
  if (match([CE_MRS_FOLLOW_UP_SCHEDULED_STATUS])) return { kind: "mrs_follow_up_scheduled" };
  const connected = match(CONNECTED_OUTCOMES);
  if (connected) return { kind: "call", callStatus: "connected", outcome: connected as CeConnectedOutcome };
  const notConnected = match(NOT_CONNECTED_OUTCOMES);
  if (notConnected) return { kind: "call", callStatus: "not_connected", outcome: notConnected as CeNotConnectedOutcome };
  return { kind: "unrecognized" };
}

/** Same rule the lead-detail page's calendar date-picker enforces by
 * simply not letting you click the cell (see holiday-date-picker.tsx) —
 * re-expressed as a plain check, because a typed Excel cell has no
 * picker to stop a bad date from being entered in the first place. */
export function invalidCeFollowUpDateReason(iso: string, holidays: ReadonlySet<string>, today: string): string | null {
  if (!isValidIsoDate(iso)) return "not a recognizable date";
  if (iso <= today) return "must be a future date";
  if (new Date(`${iso}T00:00:00Z`).getUTCDay() === 0) return "falls on a Sunday — the branch is closed";
  if (holidays.has(iso)) return "falls on an HQ-flagged holiday";
  return null;
}

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
  } else if (outcome === "Vehicle sold") {
    status = "Vehicle sold";
  } else if (outcome === "Serviced elsewhere") {
    status = "Serviced elsewhere";
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
// vehicles with no known TKM milestone: the standard periodic-service
// interval (12 months / 10,000km from the last known visit, whichever
// comes first) — not an attempt to replicate TKM's exact per-model
// schedule (early services have shorter, model-specific intervals).
export const CE_DUE_MONTHS = 12;
export const CE_DUE_KM = 10_000;

// The daily MRS catch-list is bounded to a rolling window around today,
// not "ever due" — a flat due-date proxy with no decay flags ~half of
// all active ce_leads once every historical overdue lead counts, which
// is a reactivation backlog, a different problem (see
// project_mrs_n9_system.md). Confirmed with the user 2026-10-30. Still
// governs the "overdue" lookback after the 2026-11-02 priority-tab
// change below.
export const CE_MRS_WINDOW_DAYS = 14;

// The priority tab shows leads due this many days from now, not leads
// due today — confirmed with the user 2026-11-02, deliberately matching
// TKM's own N-7 call day (not their N-9 DM/SMS day: that's an automated
// message, not a call, so N-7 — the day TKM's CAC team actually phones
// the customer — is the truer parallel for calls we're making ourselves
// to stand in for ones TKM's own pipeline would have made). Leads due
// sooner than this (today through priority-1 days out) are deliberately
// not shown anywhere on /ce/mrs, same as upcoming leads before this
// change — "we don't need to know, it is not important."
export const CE_MRS_PRIORITY_LEAD_DAYS = 7;

// Below this, a vehicle is either barely driven or the mileage/date on
// file is a placeholder (confirmed against real N-9 data: legitimate
// rates run ~20-200+ km/day — see project_mrs_n9_system.md's outlier
// analysis) — too unreliable to project a km-based date from at all.
export const CE_MIN_PLAUSIBLE_KM_PER_DAY = 1;

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
