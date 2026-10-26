import { normalizeCeVin, normalizeIndianMobile } from "./dms.mjs";

export { normalizeCeVin, normalizeIndianMobile };

export const N9_HEADERS = [
  "DM Planned Date", "DM Data Extract Date", "Customer Name", "Mobile No.",
  "Rego#", "Vehicle Name", "VIN", "Vehicle Sales Type",
  "i-CROP Next Recommended Name", "i-CROP Next Recommended Date",
  "Activity Category", "Activity Cat2 Reason", "1st CALL Planned Date",
];

const MAX_ROWS = 50_000;
const text = (value) => String(value ?? "").trim();
const normalizeHeader = (value) => text(value).replace(/\s+/g, " ").toLowerCase();

/** TKM's own export: UTF-16LE, tab-delimited, double-quoted fields (with
 * "" escaping). Multi-line addresses embed a literal \r\n inside a quoted
 * field, but the record separator between rows is sometimes a bare \r with
 * no following \n (confirmed against a real 2026-10-22 export) — a plain
 * \r\n-or-\n line splitter silently merges two records whenever that
 * happens, so this parses char-by-char instead. */
function parseTabDelimited(input, delim) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = input.length;
  while (i < n) {
    const c = input[i];
    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === delim) {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r" || c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      if (c === "\r" && input[i] === "\n") i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

function dateOnly(value) {
  const raw = text(value);
  if (raw === "" || raw.toUpperCase() === "N/A") return null;
  const match = raw.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function requiredDate(value, rowNumber, label) {
  const parsed = dateOnly(value);
  if (!parsed) throw new Error(`Row ${rowNumber}: ${label} must be a valid YYYY/MM/DD date.`);
  return parsed;
}

export function parseN9List(buffer, today) {
  const raw = buffer.toString("utf16le").replace(/^﻿/, "");
  const sheetRows = parseTabDelimited(raw, "\t");
  if (!sheetRows.length) throw new Error("The N-9 file is empty.");

  const header = sheetRows[0].map(normalizeHeader);
  const map = new Map(header.map((value, index) => [value, index]));
  if (!N9_HEADERS.every((required) => map.has(normalizeHeader(required)))) {
    throw new Error(`No sheet contains all ${N9_HEADERS.length} required N-9 headers.`);
  }
  if (sheetRows.length - 1 > MAX_ROWS) throw new Error(`File has more than ${MAX_ROWS.toLocaleString()} data rows.`);

  const at = (row, header) => row[map.get(normalizeHeader(header))];
  const selected = new Map();
  let sourceRowCount = 0;
  let extractDate = null;

  for (let index = 1; index < sheetRows.length; index++) {
    // Every real row has one extra trailing blank field beyond the header
    // count (confirmed on a real export) — harmless, just ignored.
    const source = sheetRows[index] ?? [];
    if (source.every((value) => value === null || text(value) === "")) continue;
    sourceRowCount++;
    const rowNumber = index + 1;

    const vin = normalizeCeVin(at(source, "VIN"));
    if (!vin) throw new Error(`Row ${rowNumber}: VIN is required.`);

    const rowExtractDate = requiredDate(at(source, "DM Data Extract Date"), rowNumber, "DM Data Extract Date");
    if (rowExtractDate > today) throw new Error(`Row ${rowNumber}: DM Data Extract Date ${rowExtractDate} is in the future.`);
    if (extractDate === null) extractDate = rowExtractDate;
    else if (rowExtractDate !== extractDate) {
      throw new Error(`Row ${rowNumber}: DM Data Extract Date ${rowExtractDate} does not match the file's extract date ${extractDate}.`);
    }

    const row = {
      vin,
      extractDate: rowExtractDate,
      customerName: text(at(source, "Customer Name")),
      mobileNumber: normalizeIndianMobile(at(source, "Mobile No.")),
      registrationNo: text(at(source, "Rego#")),
      vehicleModel: text(at(source, "Vehicle Name")),
      vehicleSalesType: text(at(source, "Vehicle Sales Type")),
      dmPlannedDate: requiredDate(at(source, "DM Planned Date"), rowNumber, "DM Planned Date"),
      firstCallPlannedDate: requiredDate(at(source, "1st CALL Planned Date"), rowNumber, "1st CALL Planned Date"),
      icropRecommendedName: text(at(source, "i-CROP Next Recommended Name")) || null,
      icropRecommendedDate: dateOnly(at(source, "i-CROP Next Recommended Date")),
      activityCategory: text(at(source, "Activity Category")) || null,
      activityCat2Reason: text(at(source, "Activity Cat2 Reason")) || null,
    };
    // Latest row for a VIN wins, same "pick one per vehicle" rule the DMS
    // import uses — no duplicate VIN has been seen in a real file yet, but
    // nothing here guarantees that holds for every future export.
    const previous = selected.get(vin);
    if (!previous || rowNumber > previous.worksheetRow) selected.set(vin, { row, worksheetRow: rowNumber });
  }

  if (!sourceRowCount) throw new Error("The N-9 file contains no data rows.");
  if (!extractDate) throw new Error("Could not determine the file's DM Data Extract Date.");
  const rows = [...selected.values()].map(({ row }) => row);
  return {
    rows,
    extractDate,
    sourceRowCount,
    duplicateRows: sourceRowCount - rows.length,
  };
}
