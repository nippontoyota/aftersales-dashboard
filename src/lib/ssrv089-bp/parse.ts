import * as XLSX from "xlsx";

/**
 * Cost and Sales Report - BP is otherwise never parsed (see
 * raw-report-uploads/store.ts) — but its Brand(Toyota/Grey) column needs
 * reading regardless: Grey-brand jobs' revenue doesn't show up anywhere else
 * on the dashboard. Confirmed 2026-10-01 against a real TI01A file: scom205's
 * BPU Lab Rev MTD delta for a day matched this report's Toyota+Grey combined
 * Labour Sale total to within exactly that day's Grey Labour Sale (₹36 of
 * ₹596,563.71) — i.e. scom205 excludes Grey-brand transactions entirely, so
 * without this a Grey BP job's revenue is uncounted everywhere.
 *
 * Money on a Grey BP job sits almost entirely in Pnt Mat Sale (paint
 * material), not Part Sale — Part Sale was 0 on 16 of the 17 Grey job orders
 * found at TI01A in September. Confirmed with the user: Pnt Mat Sale counts
 * toward "Parts" here, alongside the literal Part Sale column.
 *
 * Unlike the GS variant, uploads of this report have been seen in both CSV
 * and real XLSX form (same ".csv"-named upload, different actual bytes) —
 * XLSX.read handles both transparently.
 */
const BRAND_COLUMN = "Brand(Toyota/Grey)";
const PART_SALE_COLUMN = "Part Sale";
const PNT_MAT_SALE_COLUMN = "Pnt Mat Sale";
const LABOUR_SALE_COLUMN = "Labour Sale";
const SSRV089_BP_MAX_ROWS = 20_000;

export type Ssrv089BpGreyTotals = {
  greyPartsSale: number;
  greyLabourSale: number;
};

function toAmount(value: unknown): number {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function findDataSheet(workbook: XLSX.WorkBook): Record<string, unknown>[] | null {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
    if (rows.length > 0 && BRAND_COLUMN in rows[0] && PART_SALE_COLUMN in rows[0]) {
      const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
      if (range.e.r >= SSRV089_BP_MAX_ROWS) {
        throw new Error(`File has more than ${SSRV089_BP_MAX_ROWS.toLocaleString()} rows — is this the right file?`);
      }
      return rows;
    }
  }
  return null;
}

export function parseSsrv089BpGreyTotals(buffer: Buffer): Ssrv089BpGreyTotals {
  const workbook = XLSX.read(buffer, { type: "buffer", sheetRows: SSRV089_BP_MAX_ROWS + 1 });
  const rows = findDataSheet(workbook);
  if (!rows) {
    throw new Error(`Could not find a sheet with a "${BRAND_COLUMN}" column — is this a Cost and Sales Report - BP export?`);
  }

  let greyPartsSale = 0;
  let greyLabourSale = 0;
  for (const row of rows) {
    const brand = String(row[BRAND_COLUMN] ?? "").trim().toUpperCase();
    if (brand !== "GREY") continue;
    greyPartsSale += toAmount(row[PART_SALE_COLUMN]) + toAmount(row[PNT_MAT_SALE_COLUMN]);
    greyLabourSale += toAmount(row[LABOUR_SALE_COLUMN]);
  }
  return { greyPartsSale, greyLabourSale };
}
