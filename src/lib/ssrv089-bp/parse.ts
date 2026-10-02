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
 * The file is validated against the same baseline shape as the GS variant's
 * own parser (header row contains Close SA Name + Part Sale), checked
 * against the HEADER itself rather than requiring at least one data row —
 * confirmed with the user 2026-10-02, after KL01B/IR01A/KY01A turned out to
 * be uploading real Cost & Sales - BP exports with a fully correct header
 * but zero data rows underneath it (not, as first assumed, a format that
 * never carries Brand(Toyota/Grey) — their files have that column too, just
 * no rows to read it from). `isEmpty` on the result lets a caller surface
 * that distinctly (accepted, but worth flagging — could be a genuinely
 * quiet day, or the branch's DMS export silently dropping every row).
 *
 * Brand(Toyota/Grey) itself is still optional beyond that baseline check —
 * if a (non-empty) file genuinely lacks the column, Grey totals just come
 * back as 0 (meaning "can't tell", not "no Grey business"), not a rejection.
 *
 * Unlike the GS variant, uploads of this report have been seen in both CSV
 * and real XLSX form (same ".csv"-named upload, different actual bytes) —
 * XLSX.read handles both transparently.
 */
const CLOSE_SA_NAME_COLUMN = "Close SA Name";
const BRAND_COLUMN = "Brand(Toyota/Grey)";
const PART_SALE_COLUMN = "Part Sale";
const PNT_MAT_SALE_COLUMN = "Pnt Mat Sale";
const LABOUR_SALE_COLUMN = "Labour Sale";
const SSRV089_BP_MAX_ROWS = 20_000;

export type Ssrv089BpGreyTotals = {
  greyPartsSale: number;
  greyLabourSale: number;
};

export type ParsedSsrv089Bp = {
  totals: Ssrv089BpGreyTotals;
  rowCount: number;
  /** Header row matched the expected Cost & Sales - BP shape, but there were
   * zero data rows underneath it — accepted, but worth surfacing to the
   * uploader rather than treated as a silent, ordinary zero-business day. */
  isEmpty: boolean;
};

function toAmount(value: unknown): number {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

/** Checks the HEADER row directly (not `column in rows[0]`, which can't see
 * a header at all once there are zero data rows) against every sheet in the
 * workbook, in order. */
function findDataSheet(workbook: XLSX.WorkBook): { rows: Record<string, unknown>[] } | null {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const headerRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    const header = (headerRows[0] ?? []).map((c) => String(c ?? "").trim());
    if (header.includes(CLOSE_SA_NAME_COLUMN) && header.includes(PART_SALE_COLUMN)) {
      const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
      if (range.e.r >= SSRV089_BP_MAX_ROWS) {
        throw new Error(`File has more than ${SSRV089_BP_MAX_ROWS.toLocaleString()} rows — is this the right file?`);
      }
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
      return { rows };
    }
  }
  return null;
}

export function parseSsrv089BpGreyTotals(buffer: Buffer): ParsedSsrv089Bp {
  const workbook = XLSX.read(buffer, { type: "buffer", sheetRows: SSRV089_BP_MAX_ROWS + 1 });
  const found = findDataSheet(workbook);
  if (!found) {
    throw new Error(`Could not find a sheet with a "${CLOSE_SA_NAME_COLUMN}" column — is this a Cost and Sales Report - BP export?`);
  }
  const { rows } = found;

  if (rows.length === 0) {
    return { totals: { greyPartsSale: 0, greyLabourSale: 0 }, rowCount: 0, isEmpty: true };
  }
  if (!(BRAND_COLUMN in rows[0])) {
    return { totals: { greyPartsSale: 0, greyLabourSale: 0 }, rowCount: rows.length, isEmpty: false };
  }

  let greyPartsSale = 0;
  let greyLabourSale = 0;
  for (const row of rows) {
    const brand = String(row[BRAND_COLUMN] ?? "").trim().toUpperCase();
    if (brand !== "GREY") continue;
    greyPartsSale += toAmount(row[PART_SALE_COLUMN]) + toAmount(row[PNT_MAT_SALE_COLUMN]);
    greyLabourSale += toAmount(row[LABOUR_SALE_COLUMN]);
  }
  return { totals: { greyPartsSale, greyLabourSale }, rowCount: rows.length, isEmpty: false };
}
