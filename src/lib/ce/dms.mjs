import * as XLSX from "xlsx";
import { isBodyPaintOnly } from "../body-paint-only.ts";

export const DMS_HEADERS = [
  "Branch", "Name", "Tel No.", "Mobile No.", "VIN", "Model", "Delivery Date",
  "Last Service-in", "Mileage (Last Service-in)", "Last Service-in Dealer", "Last Service-in Branch",
];

const REGIONS = {
  Central: ["CO01A", "CO01B", "CO01C", "CO01E", "MV01A", "KY01A"],
  South: ["TR01A", "TR01B", "TR01C", "KL01A", "KL01B", "PH01A"],
  North: ["TL01A", "KT01A", "KT01B", "TI01A", "IR01A", "TI01B", "TI01C"],
};
const MAX_ROWS = 200_000;
const text = (value) => String(value ?? "").trim();
const normalizeHeader = (value) => text(value).replace(/\s+/g, " ").toLowerCase();

export const normalizeCeVin = (value) => text(value).replace(/^#/, "").trim().toUpperCase();

export function normalizeIndianMobile(value) {
  let digits = text(value).replace(/^#/, "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

export function extractDmsBranchCode(value) {
  return /^\s*\[([^\]]+)]/.exec(text(value))?.[1].trim().toUpperCase() || null;
}

function regionForBranch(branch) {
  return Object.entries(REGIONS).find(([, branches]) => branches.includes(branch))?.[0] ?? "";
}

function dateOnly(value) {
  let year;
  let month;
  let day;
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

function requiredDate(value, rowNumber, label, today) {
  const parsed = dateOnly(value);
  if (!parsed) throw new Error(`Row ${rowNumber}: ${label} must be a valid date.`);
  if (parsed > today) throw new Error(`Row ${rowNumber}: ${label} ${parsed} is in the future.`);
  return parsed;
}

function requiredMileage(value, rowNumber) {
  const parsed = typeof value === "number" ? value : Number(text(value).replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Row ${rowNumber}: Mileage (Last Service-in) must be a non-negative number.`);
  return parsed;
}

export function parseDmsWorkbook(buffer, today) {
  const workbook = XLSX.read(buffer, { type: "buffer", sheetRows: MAX_ROWS + 2 });
  let sheetRows = null;
  let indexes = null;

  for (const name of workbook.SheetNames) {
    const candidate = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: null, raw: true, blankrows: false });
    const header = (candidate[0] ?? []).map(normalizeHeader);
    const map = new Map(header.map((value, index) => [value, index]));
    if (DMS_HEADERS.every((required) => map.has(normalizeHeader(required)))) {
      sheetRows = candidate;
      indexes = map;
      break;
    }
  }
  if (!sheetRows || !indexes) throw new Error(`No sheet contains all ${DMS_HEADERS.length} required DMS headers.`);
  if (sheetRows.length - 1 > MAX_ROWS) throw new Error(`File has more than ${MAX_ROWS.toLocaleString()} data rows.`);

  const at = (row, header) => row[indexes.get(normalizeHeader(header))];
  const selected = new Map();
  let sourceRowCount = 0;
  let invalidContactRows = 0;
  let bodyPaintOnlyRows = 0;

  for (let index = 1; index < sheetRows.length; index++) {
    const source = sheetRows[index] ?? [];
    if (source.every((value) => value === null || text(value) === "")) continue;
    sourceRowCount++;
    const rowNumber = index + 1;
    const vin = normalizeCeVin(at(source, "VIN"));
    if (!vin) throw new Error(`Row ${rowNumber}: VIN is required.`);
    const saleBranchCode = extractDmsBranchCode(at(source, "Branch"));
    const latestServiceBranchCode = extractDmsBranchCode(at(source, "Last Service-in Branch"));
    if (!saleBranchCode) throw new Error(`Row ${rowNumber}: Branch must start with a bracketed branch code.`);
    if (!latestServiceBranchCode) throw new Error(`Row ${rowNumber}: Last Service-in Branch must start with a bracketed branch code.`);
    // CO01E/KL01B/TR01B do Body & Paint work only (see body-paint-only.ts) —
    // a "Last Service-in" recorded there is never a periodic-maintenance
    // visit, so it must not count toward a vehicle's due-for-service date.
    if (isBodyPaintOnly(latestServiceBranchCode)) {
      bodyPaintOnlyRows++;
      continue;
    }
    const contactNumber = normalizeIndianMobile(at(source, "Mobile No.")) ?? normalizeIndianMobile(at(source, "Tel No."));
    if (!contactNumber) invalidContactRows++;
    const row = {
      vin,
      customerName: text(at(source, "Name")),
      contactNumber,
      vehicleModel: text(at(source, "Model")),
      deliveryDate: requiredDate(at(source, "Delivery Date"), rowNumber, "Delivery Date", today),
      latestServiceDate: requiredDate(at(source, "Last Service-in"), rowNumber, "Last Service-in", today),
      latestMileage: requiredMileage(at(source, "Mileage (Last Service-in)"), rowNumber),
      saleBranchCode,
      latestServiceBranchCode,
      allocatedDealer: latestServiceBranchCode,
      dealerZone: regionForBranch(latestServiceBranchCode),
    };
    const previous = selected.get(vin);
    if (!previous || row.latestServiceDate > previous.row.latestServiceDate || (row.latestServiceDate === previous.row.latestServiceDate && rowNumber > previous.worksheetRow)) {
      selected.set(vin, { row, worksheetRow: rowNumber });
    }
  }

  if (!sourceRowCount) throw new Error("The workbook contains no DMS rows.");
  const rows = [...selected.values()].map(({ row }) => row);
  if (!rows.length) throw new Error("Every row's Last Service-in Branch is Body & Paint-only; nothing to import.");
  const dates = rows.map((row) => row.latestServiceDate).sort();
  return {
    rows,
    sourceRowCount,
    duplicateRows: sourceRowCount - bodyPaintOnlyRows - rows.length,
    invalidContactRows,
    bodyPaintOnlyRows,
    minReportDate: dates[0],
    maxReportDate: dates[dates.length - 1],
  };
}
