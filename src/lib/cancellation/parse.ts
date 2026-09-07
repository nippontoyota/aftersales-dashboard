// MUST be imported before "pdf-parse" — see bill/parse.ts for the full
// explanation (pdfjs-dist references browser globals at module-eval time,
// and its worker chunk needs to be statically imported for Vercel tracing).
import "../bill/pdf-polyfill";
import "pdfjs-dist/legacy/build/pdf.worker.mjs";
import { PDFParse } from "pdf-parse";
import { parseCancellationTables, type CancellationPage, type ParsedCancellationReport } from "./parse-tables";

export type {
  CancellationRow,
  CancellationBranchBlock,
  ParsedCancellationReport,
} from "./parse-tables";
export { CANCELLATION_REASONS } from "./parse-tables";

/** Reads a DMS Tax Invoice Cancellation Report PDF (run for any date range —
 * a day, a range, or a month). Extraction is pdf-parse's `getTable()` (this
 * file); the layout parsing lives in parse-tables.ts so it can be tested
 * without pdfjs. `fallbackBranch` is the uploader's own branch — used when
 * the PDF header's branch token can't be matched. */
export async function parseCancellationReport(
  buffer: Buffer,
  knownBranches: string[],
  fallbackBranch?: string,
): Promise<ParsedCancellationReport> {
  let pages: CancellationPage[];
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getTable();
    pages = result.pages as unknown as CancellationPage[];
    await parser.destroy();
  } catch (err) {
    return {
      blocks: [],
      printedTotals: null,
      errors: [`Could not read the PDF: ${err instanceof Error ? err.message : "unknown error"}`],
      warnings: [],
    };
  }
  return parseCancellationTables(pages, knownBranches, fallbackBranch);
}
