// MUST be imported before "pdf-parse": pdfjs-dist references browser globals
// (DOMMatrix, Path2D, ImageData) at module-evaluation time. See the file's
// comment for why an inline polyfill here would run too late.
import "./pdf-polyfill";
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
  } catch {
    return { invoiceNumber: null, taxableValue: null };
  }

  return {
    invoiceNumber: extractInvoiceNumber(text),
    taxableValue: extractTaxableValue(text),
  };
}

function extractInvoiceNumber(text: string): string | null {
  const patterns = [
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
    if (m) return m[1].trim();
  }
  return null;
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

function extractTaxableValue(text: string): number | null {
  const lines = text.split("\n");

  let maxTotal = 0;
  let bestTaxable: number | null = null;

  for (const line of lines) {
    const numbers = extractNumbers(line);
    if (numbers.length >= 2 && numbers.length <= 20) {
      const mathResult = findTaxableFromMath(numbers);
      if (mathResult) {
        if (mathResult.total > maxTotal) {
          maxTotal = mathResult.total;
          bestTaxable = mathResult.taxable;
        }
      }
    }
  }

  if (bestTaxable !== null) {
    return bestTaxable;
  }

  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*Total\s*$/i.test(lines[i]) && !/\bGrand\s+Total\b/i.test(lines[i])) continue;

    const window = lines.slice(i, Math.min(i + 6, lines.length));
    for (const line of window) {
      const numbers = extractNumbers(line);
      if (numbers.length >= 3) {
        const sorted = [...numbers].sort((a, b) => b - a);
        const grandTotal = sorted[0];
        for (const n of sorted.slice(1)) {
          if (n > 0 && n < grandTotal && n >= grandTotal * 0.5) return n;
        }
      }
    }
  }

  for (const line of lines) {
    if (/\bTotal\b/i.test(line)) {
      const numbers = extractNumbers(line);
      if (numbers.length >= 2) {
        const sorted = [...numbers].sort((a, b) => b - a);
        const largest = sorted[0];
        for (const n of sorted.slice(1)) {
          if (n > 0 && n < largest && n >= largest * 0.5) return n;
        }
      }
    }
  }

  const directPatterns = [
    /Total\s+Taxable\s+(?:Value|Amount)\s*:?\s*(?:Rs\.?\s*)?([\d,]+(?:\.\d{1,2})?)/i,
    /Taxable\s+(?:Value|Amount)\s*:?\s*(?:Rs\.?\s*)?([\d,]+(?:\.\d{1,2})?)/i,
    /Net\s+Taxable\s*:?\s*(?:Rs\.?\s*)?([\d,]+(?:\.\d{1,2})?)/i,
    /Sub\s*Total\s*:?\s*(?:Rs\.?\s*)?([\d,]+(?:\.\d{1,2})?)/i,
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

function extractNumbers(line: string): number[] {
  const matches = line.match(/[\d,]+\.\d{1,2}/g) ?? [];
  return matches.map(parseIndianNumber).filter((n): n is number => n !== null && n > 0);
}

function parseIndianNumber(s: string): number | null {
  const cleaned = s.replace(/,/g, "");
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}
