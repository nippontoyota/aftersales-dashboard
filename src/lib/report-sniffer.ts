import * as XLSX from "xlsx";

/**
 * Auto-detection for the HQ-only "Upload Sheet" fallback (/upload-sheet) —
 * used when a branch admin is unavailable and HQ has to submit a file on
 * their behalf. Two separate problems, handled very differently:
 *
 * - **Report type** is reliably detectable: every parser already validates
 *   its file against a real column/label signature before accepting it
 *   (see each report type's parse.ts). This just tries each signature in
 *   turn.
 * - **Branch is NOT reliably detectable from file content** for three of
 *   the four types — confirmed when their parsers were originally built:
 *   Service Info, Part Sale, and SSRV089 exports have no branch column at
 *   all (every row says "NIPPON TOYOTA" regardless of branch); only
 *   scom205 self-identifies (its own header names the branch). So
 *   `suggestBranch` is exactly that — a suggestion from the filename (and,
 *   for scom205, the file's own header) that the HQ admin must confirm or
 *   override, never something saved without a human choosing it.
 */
export type DetectedReportType = "service-info" | "part-sale" | "ssrv089" | "scom205";

const PART_SALE_COLUMNS = ["PartNo", "Sale Qty"];
const SERVICE_INFO_COLUMN = "Job Desc";
const SSRV089_COLUMN = "Close SA Name";
const SCOM205_GUS_LABEL = "Total General Units Serviced";
const SCOM205_BPU_LABEL = "Total Body & Paint Units Serviced";

/** Same-signature checks as each dedicated parser's own file-type
 * validation — this is the reliable half of detection. Returns null for a
 * file that matches none of them, never a guess. */
export function detectReportType(buffer: Buffer): DetectedReportType | null {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const objRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const firstRow = objRows[0] ?? {};

  if (PART_SALE_COLUMNS.every((c) => c in firstRow)) return "part-sale";
  if (SERVICE_INFO_COLUMN in firstRow) return "service-info";
  if (SSRV089_COLUMN in firstRow) return "ssrv089";

  // scom205 isn't column-header shaped — it's a fixed report with two
  // labeled total rows further down the sheet, same check parseScom205Workbook uses.
  const arrRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const hasGusTotal = arrRows.some((row) => String(row[0] ?? "").trim() === SCOM205_GUS_LABEL);
  const hasBpuTotal = arrRows.some((row) => String(row[0] ?? "").trim() === SCOM205_BPU_LABEL);
  if (hasGusTotal && hasBpuTotal) return "scom205";

  return null;
}

/** Best-effort branch guess — never authoritative. Checks the filename
 * first (real observed exports often carry the branch code there, e.g.
 * "Service_Info_Report-CO01B-GS.csv"), then the file's own first few rows
 * (catches scom205, which names its branch in the header). Word-boundary
 * matched against `knownBranchCodes` so e.g. "KT01A" can't accidentally
 * match inside a longer alphanumeric run. */
export function suggestBranch(fileName: string, buffer: Buffer, knownBranchCodes: string[]): string | null {
  const upperName = fileName.toUpperCase();
  for (const code of knownBranchCodes) {
    const pattern = new RegExp(`(^|[^A-Z0-9])${code.toUpperCase()}([^A-Z0-9]|$)`);
    if (pattern.test(upperName)) return code;
  }

  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: true }).slice(0, 5);
    for (const row of rows) {
      for (const cell of row) {
        const val = String(cell ?? "").trim().toUpperCase();
        const match = knownBranchCodes.find((code) => code.toUpperCase() === val);
        if (match) return match;
      }
    }
  } catch {
    // Unreadable as a spreadsheet for this pass — filename match (or none) still stands.
  }

  return null;
}
