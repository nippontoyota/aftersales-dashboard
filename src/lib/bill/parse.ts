// MUST be imported before "pdf-parse": pdfjs-dist references browser globals
// (DOMMatrix, Path2D, ImageData) at module-evaluation time. See the file's
// comment for why an inline polyfill here would run too late.
import "./pdf-polyfill";
// pdf-parse's "fake worker" setup does a *dynamic* `import(workerSrc)` that
// Vercel's file tracing can't follow, so the worker chunk is missing from the
// deployed function ("Cannot find module '.../pdf.worker.mjs'"). Importing it
// statically here gets it bundled AND sets `globalThis.pdfjsWorker`, which
// pdf-parse checks first — so the dynamic import is never reached.
import "pdfjs-dist/legacy/build/pdf.worker.mjs";
import { PDFParse } from "pdf-parse";

export type BillParseResult = {
  invoiceNumber: string | null;
  taxableValue: number | null;
};

export async function parseBillPdf(buffer: Buffer): Promise<BillParseResult> {
  let text: string;
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    text = result.text;
    await parser.destroy();
  } catch (err) {
    console.error("[bill-parse] pdf text extraction failed:", err);
    return { invoiceNumber: null, taxableValue: null };
  }

  const invoiceNumber = extractInvoiceNumber(text);
  const taxableValue = extractTaxableValue(text);

  if (invoiceNumber === null || taxableValue === null) {
    // Log the raw layout so incomplete extractions can be diagnosed from the
    // Vercel function logs (pdf.js spaces text differently across platforms).
    console.warn(
      `[bill-parse] incomplete extraction (invoice=${invoiceNumber}, taxable=${taxableValue}). Text:\n` +
        text.slice(0, 4000),
    );
  }

  return { invoiceNumber, taxableValue };
}

export function extractInvoiceNumber(text: string): string | null {
  const patterns = [
    // Format 2 (GST e-invoice): "Invoice Serial Number : BSA/26-27/013"
    /Invoice\s*Serial\s*(?:No\.?|Number)?\s*:?\s*([A-Za-z0-9][\w\-\/]{3,25})/i,
    // Format 1 (Tax Invoice (Cash)): a bare "AA26-01514" token
    /Invoice\s*No\.?\s*:?\s*\n?\s*([A-Z]{2}\d{2}-\d{4,6})/i,
    /\n([A-Z]{2}\d{2}-\d{4,6})\n/,
    /(?:^|\s)([A-Z]{2}\d{2}-\d{4,6})(?:\s|$)/,
    /Invoice\s*No\.?\s*:?\s*([A-Z0-9][\w\-\/]{3,20})/i,
    /Bill\s*No\.?\s*:?\s*([A-Z0-9][\w\-\/]{3,20})/i,
    /Invoice\s*Number\s*:?\s*([A-Z0-9][\w\-\/]{3,20})/i,
    /Inv\.?\s*No\.?\s*:?\s*([A-Z0-9][\w\-\/]{3,20})/i,
  ];

  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      const candidate = m[1].trim();
      // Guard against capturing a stray word like "Date" when the label has
      // no value on the same line.
      if (/\d/.test(candidate) && candidate.toLowerCase() !== "date") return candidate;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Taxable value
//
// These invoices come in two layouts. Rather than one fragile heuristic we try
// a series of label-anchored strategies (whitespace-tolerant) and fall back to
// the older column/math heuristics only if none match.
// ---------------------------------------------------------------------------

export function extractTaxableValue(text: string): number | null {
  const strategies = [
    fromLineTotalRow, // Format 2: "Line Total: ₹ 22,903.68 ₹ 2,061.33 ..."
    fromGstRate, // Format 1: CGST amount ÷ its rate = taxable base
    fromTotalsRow, // Format 1: "<afterTax> <tax> <taxable> <disc> <total>" row
    fromGrandTotalMinusGst, // generic: grand total − all GST amounts
    fromMathHeuristic, // legacy: scan every line for a self-consistent set
    fromDirectLabel, // legacy: "Taxable Value: 1,234.00" etc.
  ];

  for (const strategy of strategies) {
    const val = strategy(text);
    if (val !== null && val > 0) return round2(val);
  }
  return null;
}

/** Format 2 — the GST e-invoice footer row. */
function fromLineTotalRow(text: string): number | null {
  const m = text.match(/Line\s*Total\s*:?[^\n]*/i);
  if (!m) return null;

  const nums = moneyTokens(m[0]);
  if (nums.length === 0) return null;

  // Column order on this row is: Taxable Value, CGST, SGST, IGST.
  const taxable = nums[0];
  if (taxable <= 0) return null;

  // Confirm against the invoice grand total when we can see it:
  // taxable + CGST + SGST + IGST ≈ grand total.
  const grand = grandTotalWithPaise(text);
  if (grand !== null && nums.length >= 2) {
    const sum = nums.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - grand) > 1) {
      // Row didn't line up — let another strategy try.
      return null;
    }
  }
  return taxable;
}

/**
 * Format 1 — "Central GST for Parts @ 9% : 108.27". The taxable base is the GST
 * amount divided by its rate. CGST and SGST share the same base, so we sum the
 * per-line bases of one jurisdiction (plus any IGST lines).
 */
function fromGstRate(text: string): number | null {
  const re = /\b(Central|State|Integrated|C|S|I)\s*GST\s+(?:for\s+\w+\s+)?@?\s*([\d.]+)\s*%\s*:?\s*(?:Rs\.?|₹)?\s*([\d,]+\.\d{2})/gi;

  let centralBase = 0;
  let integratedBase = 0;
  let sawCentral = false;
  let sawIntegrated = false;

  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const rate = parseFloat(m[2]) / 100;
    const amount = parseIndianNumber(m[3]);
    if (!rate || amount === null || amount <= 0) continue;
    const base = amount / rate;

    const kind = m[1].toLowerCase();
    if (kind.startsWith("c")) {
      centralBase += base;
      sawCentral = true;
    } else if (kind.startsWith("i")) {
      integratedBase += base;
      sawIntegrated = true;
    }
    // "State"/"S" mirrors the central base — ignore to avoid double counting.
  }

  if (!sawCentral && !sawIntegrated) return null;

  const taxable = centralBase + integratedBase;
  if (taxable <= 0) return null;

  // Sanity-check against the grand total if present.
  const grand = grandTotalWithPaise(text) ?? grandTotalRounded(text);
  if (grand !== null) {
    const gstTotal = totalGstAmount(text);
    if (gstTotal !== null && Math.abs(taxable + gstTotal - grand) > 1.5) return null;
  }
  return taxable;
}

/**
 * Format 1 — the single summary row, e.g. "1,419.54  216.54  1,203.00  0.00
 * 1,203.00" = amount-after-tax, tax, taxable, discount, total. We identify it
 * structurally: amount-after-tax ≈ tax + taxable, and it matches the grand
 * total (± rounding).
 */
function fromTotalsRow(text: string): number | null {
  const grand = grandTotalRounded(text) ?? grandTotalWithPaise(text);

  for (const line of text.split("\n")) {
    const nums = moneyTokens(line);
    if (nums.length < 3 || nums.length > 6) continue;

    const [afterTax, tax, taxable] = nums;
    if (afterTax <= 0 || tax <= 0 || taxable <= 0) continue;
    if (Math.abs(afterTax - (tax + taxable)) > 0.05) continue;
    if (grand !== null && Math.abs(afterTax - grand) > 1) continue;

    return taxable;
  }
  return null;
}

/** Generic — grand total minus every GST amount on the document. */
function fromGrandTotalMinusGst(text: string): number | null {
  const grand = grandTotalWithPaise(text);
  const gst = totalGstAmount(text);
  if (grand === null || gst === null || gst <= 0) return null;

  const taxable = grand - gst;
  if (taxable <= 0 || taxable >= grand) return null;
  return taxable;
}

/** Legacy column/math heuristic — kept as a fallback for unseen layouts. */
function fromMathHeuristic(text: string): number | null {
  const lines = text.split("\n");
  let maxTotal = 0;
  let bestTaxable: number | null = null;

  for (const line of lines) {
    const numbers = legacyNumbers(line);
    if (numbers.length >= 2 && numbers.length <= 20) {
      const mathResult = findTaxableFromMath(numbers);
      if (mathResult && mathResult.total > maxTotal) {
        maxTotal = mathResult.total;
        bestTaxable = mathResult.taxable;
      }
    }
  }
  return bestTaxable;
}

/** Legacy direct labels. */
function fromDirectLabel(text: string): number | null {
  const directPatterns = [
    /Total\s+Taxable\s+(?:Value|Amount)\s*:?\s*(?:Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /Taxable\s+(?:Value|Amount)\s*:?\s*(?:Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /Net\s+Taxable\s*:?\s*(?:Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /Sub\s*Total\s*:?\s*(?:Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  ];
  for (const pat of directPatterns) {
    const m = text.match(pat);
    if (m) {
      const val = parseIndianNumber(m[1]);
      if (val !== null && val > 0) return val;
    }
  }
  return null;
}

// --- shared helpers -------------------------------------------------------

/** All "1,234.56" style money amounts on a string, in order, commas stripped. */
function moneyTokens(s: string): number[] {
  const matches = s.match(/\d[\d,]*\.\d{2}/g) ?? [];
  return matches
    .map(parseIndianNumber)
    .filter((n): n is number => n !== null);
}

/** Grand total including paise: "Total ₹ 27,026.34" / "Grand Total : 1,420.00". */
function grandTotalWithPaise(text: string): number | null {
  const patterns = [
    /\bGrand\s*Total\s*:?\s*(?:Rs\.?|₹)?\s*([\d,]+\.\d{2})/i,
    /Invoice\s*Value[^\n]*\bTotal\s+(?:Rs\.?|₹)?\s*([\d,]+\.\d{2})/i,
    /(?:^|\n)[^\n]*?\bTotal\s+₹\s*([\d,]+\.\d{2})/,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      const v = parseIndianNumber(m[1]);
      if (v !== null && v > 0) return v;
    }
  }
  return null;
}

/** Grand total rounded to the rupee, when the paise value isn't distinct. */
function grandTotalRounded(text: string): number | null {
  const m =
    text.match(/\bGrand\s*Total\s*:?\s*(?:Rs\.?|₹)?\s*([\d,]+(?:\.\d{2})?)/i) ??
    text.match(/Invoice\s*Total\s*(?:Rs\.?|₹)?\s*([\d,]+(?:\.\d{2})?)/i);
  if (!m) return null;
  const v = parseIndianNumber(m[1]);
  return v !== null && v > 0 ? v : null;
}

/** Sum of every GST amount: "@ 9% : 108.27" and "9.0% ₹ 923.51" style cells. */
function totalGstAmount(text: string): number | null {
  let total = 0;
  let saw = false;

  const labelled = /@\s*[\d.]+\s*%\s*:?\s*(?:Rs\.?|₹)?\s*([\d,]+\.\d{2})/g;
  const tabular = /\b\d{1,2}(?:\.\d)?\s*%\s*(?:Rs\.?|₹)?\s*([\d,]+\.\d{2})/g;

  let m: RegExpExecArray | null;
  while ((m = labelled.exec(text)) !== null) {
    const v = parseIndianNumber(m[1]);
    if (v !== null) {
      total += v;
      saw = true;
    }
  }
  if (saw) return total;

  while ((m = tabular.exec(text)) !== null) {
    const v = parseIndianNumber(m[1]);
    if (v !== null) {
      total += v;
      saw = true;
    }
  }
  return saw ? total : null;
}

function legacyNumbers(line: string): number[] {
  const matches = line.match(/[\d,]+\.\d{1,2}/g) ?? [];
  return matches
    .map(parseIndianNumber)
    .filter((n): n is number => n !== null && n > 0);
}

function findTaxableFromMath(numbers: number[]): { total: number; taxable: number } | null {
  if (numbers.length < 2) return null;
  const sorted = [...numbers].sort((a, b) => b - a);
  const total = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const taxable = sorted[i];
    if (taxable <= 0 || taxable === total) continue;

    const diff = total - taxable;
    if (diff < 0.02) continue;

    const others = [];
    for (let j = 1; j < sorted.length; j++) {
      if (j !== i) others.push(sorted[j]);
    }

    for (const t1 of others) {
      if (Math.abs(t1 - diff) < 0.05) return { total, taxable };
    }
    for (let j = 0; j < others.length; j++) {
      for (let k = j + 1; k < others.length; k++) {
        if (Math.abs(others[j] + others[k] - diff) < 0.05) return { total, taxable };
      }
    }
    for (let j = 0; j < others.length; j++) {
      for (let k = j + 1; k < others.length; k++) {
        for (let l = k + 1; l < others.length; l++) {
          if (Math.abs(others[j] + others[k] + others[l] - diff) < 0.05) return { total, taxable };
        }
      }
    }
  }

  return null;
}

function parseIndianNumber(s: string): number | null {
  const cleaned = s.replace(/,/g, "");
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
