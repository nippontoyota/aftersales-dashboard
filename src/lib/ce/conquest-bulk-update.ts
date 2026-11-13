import "server-only";
import * as XLSX from "xlsx";
import {
  deriveCeCallUpdate,
  invalidCeFollowUpDateReason,
  outcomeNeedsDate,
  resolveCeBulkOutcome,
  type CeCallOutcome,
  type CeCallStatus,
  type CeStatus,
} from "./rules";
import { loadConquestLeadsForBulkUpdate, updateConquestLead, type CeConquestBulkLeadLookup } from "./conquest-store";

/** Conquest's own "download, call offline, reupload" workflow (2026-11-13,
 * at the user's request) — same idea as the MRS catch list's version
 * (src/lib/ce/mrs-bulk-update.ts), keyed by each row's Lead ID instead of
 * VIN since not every conquest lead has one. Every row runs through the
 * exact same updateConquestLead function the single-lead form uses, so the
 * result is indistinguishable from doing it by hand. Generous, not a real
 * limit at any plausible daily volume — just enough to reject a garbage
 * file outright. */
const MAX_ROWS = 5_000;

export type CeConquestBulkRow = {
  rowNumber: number;
  id: string;
  customerName: string | null;
  currentStatus: CeStatus | null;
  outcomeRaw: string;
  callStatus: CeCallStatus | null;
  outcome: CeCallOutcome | null;
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

/** Same date-cell handling as mrs-bulk-update.ts's parseBulkDateCell — kept
 * in sync by hand since the two modules are otherwise independent. */
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

type RawRow = { rowNumber: number; id: string; outcomeRaw: string; dateRaw: unknown; note: string };

/** Finds whichever sheet has the columns this upload needs (matching by
 * header text, not position or sheet name), same tolerant approach as
 * mrs-bulk-update.ts's readBulkWorkbook. */
function readBulkWorkbook(buffer: Buffer): RawRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  let rows: unknown[][] | null = null;
  let indexes: Map<string, number> | null = null;

  for (const name of workbook.SheetNames) {
    const candidate = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: null, raw: true, blankrows: false });
    const header = (candidate[0] ?? []).map(normalizeHeader);
    if (header.includes("lead id") && header.some((h) => h.includes("outcome"))) {
      rows = candidate;
      indexes = new Map(header.map((value, index) => [value, index]));
      break;
    }
  }
  if (!rows || !indexes) throw new Error('Could not find a sheet with "Lead ID" and "Outcome" columns — use the file from "Download Excel" without renaming its headers.');
  if (rows.length - 1 > MAX_ROWS) throw new Error(`Sheet has more than ${MAX_ROWS.toLocaleString()} data rows — split it into smaller batches.`);

  const idCol = indexes.get("lead id")!;
  const outcomeHeader = [...indexes.keys()].find((h) => h.includes("outcome"))!;
  const dateHeader = [...indexes.keys()].find((h) => h.includes("follow-up") || h.includes("appointment"));
  const noteHeader = [...indexes.keys()].find((h) => h.includes("note"));
  const outcomeCol = indexes.get(outcomeHeader)!;
  const dateCol = dateHeader !== undefined ? indexes.get(dateHeader)! : undefined;
  const noteCol = noteHeader !== undefined ? indexes.get(noteHeader)! : undefined;

  const result: RawRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const source = rows[i] ?? [];
    const id = text(source[idCol]);
    const outcomeRaw = text(source[outcomeCol]);
    const dateRaw = dateCol !== undefined ? source[dateCol] : null;
    const note = noteCol !== undefined ? text(source[noteCol]) : "";
    if (!id && !outcomeRaw && !text(dateRaw) && !note) continue;
    result.push({ rowNumber: i + 1, id, outcomeRaw, dateRaw, note });
  }
  return result;
}

function buildRow(raw: RawRow, lookup: Map<string, CeConquestBulkLeadLookup>, context: { today: string; holidays: ReadonlySet<string>; requireAssignedTo?: string }): CeConquestBulkRow {
  const base = { rowNumber: raw.rowNumber, id: raw.id, outcomeRaw: raw.outcomeRaw, note: raw.note };
  const blocked = (error: string, lead?: CeConquestBulkLeadLookup): CeConquestBulkRow => ({
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

  if (!raw.id || !/^\d+$/.test(raw.id)) return blocked("Missing or invalid Lead ID.");
  const lead = lookup.get(raw.id);
  if (!lead) return blocked("Lead ID not found among Conquest leads.");

  if (!raw.outcomeRaw) {
    return { ...base, customerName: lead.customerName, currentStatus: lead.status, callStatus: null, outcome: null, newStatus: null, nextFollowUpDate: null, error: null, warning: null, empty: true };
  }
  if (!lead.active) return blocked("Archived leads are read-only.", lead);
  if (context.requireAssignedTo && lead.assignedTo !== context.requireAssignedTo) return blocked("This lead isn't assigned to you.", lead);

  const resolution = resolveCeBulkOutcome(raw.outcomeRaw);
  // Conquest's dropdown never offers the MRS-only shortcut — if someone
  // typed it anyway, it's just as invalid as any other unrecognized value.
  if (resolution.kind === "unrecognized" || resolution.kind === "mrs_follow_up_scheduled") {
    return blocked(`Unrecognized outcome "${raw.outcomeRaw}" — pick one of the dropdown values exactly.`, lead);
  }

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
 * apply re-parses and re-validates the same file from scratch rather than
 * trusting anything the client sent back from preview. */
export async function validateConquestBulkRows(buffer: Buffer, context: { today: string; holidays: ReadonlySet<string>; requireAssignedTo?: string }): Promise<CeConquestBulkRow[]> {
  const raw = readBulkWorkbook(buffer);
  if (raw.length === 0) return [];
  const ids = [...new Set(raw.map((r) => r.id).filter(Boolean))];
  const lookup = await loadConquestLeadsForBulkUpdate(ids);
  return raw.map((row) => buildRow(row, lookup, context));
}

export type CeConquestBulkApplyResult = { rowNumber: number; id: string; success: boolean; message: string };

/** Applies every row that came back error-free and non-empty, one at a
 * time — each row already has its own transaction inside
 * updateConquestLead, so a typo three rows from the end shouldn't undo the
 * good ones ahead of it. */
export async function applyConquestBulkRows(rows: CeConquestBulkRow[], username: string, requireAssignedTo?: string): Promise<CeConquestBulkApplyResult[]> {
  const results: CeConquestBulkApplyResult[] = [];
  for (const row of rows) {
    if (row.empty || row.error) continue;
    try {
      if (row.callStatus && row.outcome) {
        await updateConquestLead({ id: row.id, callStatus: row.callStatus, outcome: row.outcome, nextFollowUpDate: row.nextFollowUpDate, note: row.note, username, requireAssignedTo });
      } else {
        continue;
      }
      results.push({ rowNumber: row.rowNumber, id: row.id, success: true, message: "Updated." });
    } catch (error) {
      results.push({ rowNumber: row.rowNumber, id: row.id, success: false, message: error instanceof Error ? error.message : "Could not update this lead." });
    }
  }
  return results;
}
