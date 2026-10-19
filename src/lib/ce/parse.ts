import * as XLSX from "xlsx";

export const CE_HEADERS = [
  "AlloatedDealer",
  "Dealer Zone",
  "VIN_NO",
  "SALE_DLR_CD",
  "Sales_Date",
  "UIOYear",
  "Sale Branch Code",
  "N Dealer Code",
  "AVF",
  "N Report Date",
  "N Mileage",
  "N-1 Dealer Code",
  "N-1 Report Date",
  "N-1 Mileage",
  "N-2 Dealer Code",
  "N-2 Mileage",
  "N-2 Report Date",
  "Customer First Name",
  "Customer Family Name",
] as const;

export type CeLeadInput = {
  allocatedDealer: string;
  dealerZone: string;
  vin: string;
  saleDealerCode: string;
  salesDate: string;
  uioYear: number;
  saleBranchCode: string;
  nDealerCode: string;
  avf: number | null;
  nReportDate: string;
  nMileage: number;
  n1DealerCode: string;
  n1ReportDate: string | null;
  n1Mileage: number | null;
  n2DealerCode: string;
  n2Mileage: number | null;
  n2ReportDate: string | null;
  customerFirstName: string;
  customerFamilyName: string;
};

export type ParsedCeWorkbook = {
  rows: CeLeadInput[];
  minReportDate: string;
  maxReportDate: string;
};

const MAX_ROWS = 25_000;
const normalizeHeader = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const text = (value: unknown) => String(value ?? "").trim();

export const normalizeCeVin = (value: unknown) => text(value).replace(/^#/, "").trim().toUpperCase();

function dateOnly(value: unknown): string | null {
  let year: number;
  let month: number;
  let day: number;
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    ({ y: year, m: month, d: day } = parsed);
  } else {
    const match = text(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/);
    if (!match) return null;
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  }
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function requiredDate(value: unknown, rowNumber: number, label: string): string {
  const parsed = dateOnly(value);
  if (!parsed) throw new Error(`Row ${rowNumber}: ${label} must be a valid date.`);
  return parsed;
}

function requiredNumber(value: unknown, rowNumber: number, label: string): number {
  if (value === null || value === undefined || text(value) === "") throw new Error(`Row ${rowNumber}: ${label} is required.`);
  const parsed = typeof value === "number" ? value : Number(text(value).replace(/,/g, ""));
  if (!Number.isFinite(parsed)) throw new Error(`Row ${rowNumber}: ${label} must be numeric.`);
  return parsed;
}

export function parseCeWorkbook(buffer: Buffer, today: string): ParsedCeWorkbook {
  const workbook = XLSX.read(buffer, { type: "buffer", sheetRows: MAX_ROWS + 2 });
  let rows: unknown[][] | null = null;
  let indexes: Map<string, number> | null = null;

  for (const name of workbook.SheetNames) {
    const candidate = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: null, raw: true, blankrows: false });
    const header = (candidate[0] ?? []).map(normalizeHeader);
    const map = new Map(header.map((value, index) => [value, index]));
    if (CE_HEADERS.every((required) => map.has(normalizeHeader(required)))) {
      rows = candidate;
      indexes = map;
      break;
    }
  }
  if (!rows || !indexes) throw new Error(`No sheet contains all ${CE_HEADERS.length} required UIO headers.`);
  if (rows.length - 1 > MAX_ROWS) throw new Error(`File has more than ${MAX_ROWS.toLocaleString()} data rows.`);

  const at = (row: unknown[], header: (typeof CE_HEADERS)[number]) => row[indexes!.get(normalizeHeader(header))!];
  const result: CeLeadInput[] = [];
  const vins = new Set<string>();

  for (let index = 1; index < rows.length; index++) {
    const source = rows[index] ?? [];
    if (source.every((value) => value === null || text(value) === "")) continue;
    const rowNumber = index + 1;
    const vin = normalizeCeVin(at(source, "VIN_NO"));
    if (!vin) throw new Error(`Row ${rowNumber}: VIN_NO is required.`);
    if (vins.has(vin)) throw new Error(`Row ${rowNumber}: duplicate VIN ${vin}.`);
    vins.add(vin);

    const nReportDate = requiredDate(at(source, "N Report Date"), rowNumber, "N Report Date");
    if (nReportDate > today) throw new Error(`Row ${rowNumber}: N Report Date ${nReportDate} is in the future.`);
    const uioYear = requiredNumber(at(source, "UIOYear"), rowNumber, "UIOYear");
    if (!Number.isInteger(uioYear)) throw new Error(`Row ${rowNumber}: UIOYear must be a whole number.`);

    result.push({
      allocatedDealer: text(at(source, "AlloatedDealer")),
      dealerZone: text(at(source, "Dealer Zone")),
      vin,
      saleDealerCode: text(at(source, "SALE_DLR_CD")),
      salesDate: requiredDate(at(source, "Sales_Date"), rowNumber, "Sales_Date"),
      uioYear,
      saleBranchCode: text(at(source, "Sale Branch Code")),
      nDealerCode: text(at(source, "N Dealer Code")),
      avf: requiredNumber(at(source, "AVF"), rowNumber, "AVF"),
      nReportDate,
      nMileage: requiredNumber(at(source, "N Mileage"), rowNumber, "N Mileage"),
      n1DealerCode: text(at(source, "N-1 Dealer Code")),
      n1ReportDate: requiredDate(at(source, "N-1 Report Date"), rowNumber, "N-1 Report Date"),
      n1Mileage: requiredNumber(at(source, "N-1 Mileage"), rowNumber, "N-1 Mileage"),
      n2DealerCode: text(at(source, "N-2 Dealer Code")),
      n2Mileage: requiredNumber(at(source, "N-2 Mileage"), rowNumber, "N-2 Mileage"),
      n2ReportDate: requiredDate(at(source, "N-2 Report Date"), rowNumber, "N-2 Report Date"),
      customerFirstName: text(at(source, "Customer First Name")),
      customerFamilyName: text(at(source, "Customer Family Name")),
    });
  }
  if (result.length === 0) throw new Error("The workbook contains no lead rows.");
  const dates = result.map((row) => row.nReportDate).sort();
  return { rows: result, minReportDate: dates[0], maxReportDate: dates[dates.length - 1] };
}
