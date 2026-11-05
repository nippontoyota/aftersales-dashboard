import "server-only";
import * as XLSX from "xlsx";
import { normalizeCeVin } from "./parse";
import {
  CE_MRS_FOLLOW_UP_SCHEDULED_STATUS,
  deriveCeCallUpdate,
  invalidCeFollowUpDateReason,
  outcomeNeedsDate,
  resolveCeBulkOutcome,
  type CeCallOutcome,
  type CeCallStatus,
  type CeStatus,
} from "./rules";
import { loadCeLeadsForBulkUpdate, markCeMrsFollowUpAlreadyScheduled, updateCeLead, type CeBulkLeadLookup } from "./store";

/** The "download, call offline, reupload" workflow (2026-11-05, at the
 * user's request) — the CAC team's own system is slow enough that opening
 * each lead one at a time to log a call is a real drag, so the same
 * Excel export they already use for reference gets three fillable
 * columns (Outcome / Follow-up-Appointment Date / Note) they can type
 * into while calling, then reupload. Every row runs through the exact
 * same updateCeLead/markCeMrsFollowUpAlreadyScheduled functions the
 * single-lead form uses, so the result is indistinguishable from doing
 * it by hand — same attempt-count math, same activity log, same MRS
 * exclusion rules. Generous, not a real limit at the team's actual
 * volume (confirmed ~200 rows/day) — just enough to reject a garbage
 * file outright. */
const MAX_ROWS = 5_000;

export type CeMrsBulkRow = {
  rowNumber: number;
  vin: string;
  customerName: string | null;
  currentStatus: CeStatus | null;
  outcomeRaw: string;
  callStatus: CeCallStatus | null;
  outcome: CeCallOutcome | typeof CE_MRS_FOLLOW_UP_SCHEDULED_STATUS | null;
  /** What the lead's status would become — informational only (preview
   * convenience); the actual write always recomputes this fresh against
   * whatever the lead's attempt count is at apply time. */
  newStatus: CeStatus | null;
  nextFollowUpDate: string | null;
  note: string;
  /** Blocks this row from being applied. */
  error: string | null;
  /** Doesn't block applying — just flagged for a second look (most
   * notably the "this looks like it was already done today" check). */
  warning: string | null;
  /** No outcome typed in yet — left for later, not a mistake. */
  empty: boolean;
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function isoFromParts(year: number, month: number, day: number): string | null {
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Accepts whatever Excel hands back for that cell: a real date (typed
 * via Excel's own date entry — comes through as a serial number), typed
 * DD/MM/YYYY text (the format the rest of this app displays dates in,
 * and what the exported column is formatted as text to encourage), or
 * plain ISO text. */
function parseBulkDateCell(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return isoFromParts(parsed.y, parsed.m, parsed.d);
  }
  const str = text(value);
  if (!str) return null;
  const ddmmyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(str);
  if (ddmmyyyy) return isoFromParts(Number(ddmmyyyy[3]), Number(ddmmyyyy[2]), Number(ddmmyyyy[1]));
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (iso) return isoFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  return null;
}

type RawRow = { rowNumber: number; vin: string; outcomeRaw: string; dateRaw: unknown; note: string };

/** Finds whichever sheet actually has the columns this upload needs
 * (matching by header text, not position or sheet name) and pulls out
 * VIN/Outcome/date/note by the same tolerant header match — so a sheet
 * that got reordered, renamed, or has the hidden "Outcomes" helper sheet
 * sitting next to it still parses correctly. */
function readBulkWorkbook(buffer: Buffer): RawRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  let rows: unknown[][] | null = null;
  let indexes: Map<string, number> | null = null;

  for (const name of workbook.SheetNames) {
    const candidate = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: null, raw: true, blankrows: false });
    const header = (candidate[0] ?? []).map(normalizeHeader);
    if (header.includes("vin") && header.some((h) => h.includes("outcome"))) {
      rows = candidate;
      indexes = new Map(header.map((value, index) => [value, index]));
      break;
    }
  }
  if (!rows || !indexes) throw new Error('Could not find a sheet with "VIN" and "Outcome" columns — use the file from "Download Excel" without renaming its headers.');
  if (rows.length - 1 > MAX_ROWS) throw new Error(`Sheet has more than ${MAX_ROWS.toLocaleString()} data rows — split it into smaller batches.`);

  const vinCol = indexes.get("vin")!;
  const outcomeHeader = [...indexes.keys()].find((h) => h.includes("outcome"))!;
  const dateHeader = [...indexes.keys()].find((h) => h.includes("follow-up") || h.includes("appointment"));
  const noteHeader = [...indexes.keys()].find((h) => h.includes("note"));
  const outcomeCol = indexes.get(outcomeHeader)!;
  const dateCol = dateHeader !== undefined ? indexes.get(dateHeader)! : undefined;
  const noteCol = noteHeader !== undefined ? indexes.get(noteHeader)! : undefined;

  const result: RawRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const source = rows[i] ?? [];
    const vin = normalizeCeVin(source[vinCol]);
    const outcomeRaw = text(source[outcomeCol]);
    const dateRaw = dateCol !== undefined ? source[dateCol] : null;
    const note = noteCol !== undefined ? text(source[noteCol]) : "";
    if (!vin && !outcomeRaw && !text(dateRaw) && !note) continue;
    result.push({ rowNumber: i + 1, vin, outcomeRaw, dateRaw, note });
  }
  return result;
}

function buildRow(raw: RawRow, lookup: Map<string, CeBulkLeadLookup>, context: { today: string; holidays: ReadonlySet<string>; requireAssignedTo?: string }): CeMrsBulkRow {
  const base = { rowNumber: raw.rowNumber, vin: raw.vin, outcomeRaw: raw.outcomeRaw, note: raw.note };
  const blocked = (error: string, lead?: CeBulkLeadLookup): CeMrsBulkRow => ({
    ...base,
    customerName: lead?.customerName ?? null,
    currentStatus: lead?.status ?? null,
    callStatus: null,
    outcome: null,
    newStatus: null,
    nextFollowUpDate: null,
    error,
    warning: null,
    empty: false,
  });

  if (!raw.vin) return blocked("Missing VIN.");
  const lead = lookup.get(raw.vin);
  if (!lead) return blocked("VIN not found among CE leads.");

  if (!raw.outcomeRaw) {
    return { ...base, customerName: lead.customerName, currentStatus: lead.status, callStatus: null, outcome: null, newStatus: null, nextFollowUpDate: null, error: null, warning: null, empty: true };
  }
  if (!lead.active) return blocked("Archived leads are read-only.", lead);
  if (context.requireAssignedTo && lead.assignedTo !== context.requireAssignedTo) return blocked("This lead isn't assigned to you.", lead);

  const resolution = resolveCeBulkOutcome(raw.outcomeRaw);
  if (resolution.kind === "unrecognized") {
    return blocked(`Unrecognized outcome "${raw.outcomeRaw}" — pick one of the dropdown values exactly.`, lead);
  }

  if (resolution.kind === "mrs_follow_up_scheduled") {
    const warning = lead.status === CE_MRS_FOLLOW_UP_SCHEDULED_STATUS && lead.updatedDateIst === context.today
      ? "This lead was already marked this way earlier today — possible duplicate upload?"
      : null;
    return { ...base, customerName: lead.customerName, currentStatus: lead.status, callStatus: null, outcome: CE_MRS_FOLLOW_UP_SCHEDULED_STATUS, newStatus: CE_MRS_FOLLOW_UP_SCHEDULED_STATUS, nextFollowUpDate: null, error: null, warning, empty: false };
  }

  // resolution.kind === "call"
  let nextFollowUpDate: string | null = null;
  let error: string | null = null;
  if (outcomeNeedsDate(resolution.outcome)) {
    const parsed = parseBulkDateCell(raw.dateRaw);
    if (!parsed) {
      error = `"${resolution.outcome}" needs a follow-up/appointment date — enter it as DD/MM/YYYY.`;
    } else {
      const reason = invalidCeFollowUpDateReason(parsed, context.holidays, context.today);
      if (reason) error = `Follow-up/appointment date ${reason}.`;
      else nextFollowUpDate = parsed;
    }
  }
  if (!error && !raw.note.trim()) error = "A note on what the customer said is required.";

  const warning = !error && lead.latestOutcome === resolution.outcome && lead.updatedDateIst === context.today
    ? "This lead's latest outcome already matches — possible duplicate upload?"
    : null;

  // Informational only — the real write recomputes this itself against
  // whatever attempt_count is current at that moment.
  const newStatus = error ? null : deriveCeCallUpdate({ currentAttemptCount: lead.attemptCount, callStatus: resolution.callStatus, outcome: resolution.outcome, followUpDate: nextFollowUpDate, today: context.today }).status;

  return {
    ...base,
    customerName: lead.customerName,
    currentStatus: lead.status,
    callStatus: resolution.callStatus,
    outcome: resolution.outcome,
    newStatus,
    nextFollowUpDate,
    error,
    warning,
    empty: false,
  };
}

/** Shared by both the preview and apply routes so they can never drift —
 * apply re-parses and re-validates the same file from scratch rather
 * than trusting anything the client sent back from preview, so a
 * tampered or stale payload is never a concern. */
export async function validateMrsBulkRows(buffer: Buffer, context: { today: string; holidays: ReadonlySet<string>; requireAssignedTo?: string }): Promise<CeMrsBulkRow[]> {
  const raw = readBulkWorkbook(buffer);
  if (raw.length === 0) return [];
  const vins = [...new Set(raw.map((r) => r.vin).filter(Boolean))];
  const lookup = await loadCeLeadsForBulkUpdate(vins);
  return raw.map((row) => buildRow(row, lookup, context));
}

export type CeMrsBulkApplyResult = { rowNumber: number; vin: string; success: boolean; message: string };

/** Applies every row that came back error-free and non-empty, one at a
 * time — not one DB transaction for the whole sheet, since each row
 * already has its own transaction (inside updateCeLead /
 * markCeMrsFollowUpAlreadyScheduled) and a typo three rows from the end
 * shouldn't undo the 197 good ones ahead of it. */
export async function applyMrsBulkRows(rows: CeMrsBulkRow[], username: string, requireAssignedTo?: string): Promise<CeMrsBulkApplyResult[]> {
  const results: CeMrsBulkApplyResult[] = [];
  for (const row of rows) {
    if (row.empty || row.error) continue;
    try {
      if (row.outcome === CE_MRS_FOLLOW_UP_SCHEDULED_STATUS) {
        await markCeMrsFollowUpAlreadyScheduled({ vin: row.vin, username, requireAssignedTo });
      } else if (row.callStatus && row.outcome) {
        await updateCeLead({ vin: row.vin, callStatus: row.callStatus, outcome: row.outcome, nextFollowUpDate: row.nextFollowUpDate, note: row.note, username, requireAssignedTo });
      } else {
        continue;
      }
      results.push({ rowNumber: row.rowNumber, vin: row.vin, success: true, message: "Updated." });
    } catch (error) {
      results.push({ rowNumber: row.rowNumber, vin: row.vin, success: false, message: error instanceof Error ? error.message : "Could not update this lead." });
    }
  }
  return results;
}
