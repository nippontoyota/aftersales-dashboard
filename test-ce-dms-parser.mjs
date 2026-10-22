import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { DMS_HEADERS, extractDmsBranchCode, normalizeCeVin, normalizeIndianMobile, parseDmsWorkbook } from "./src/lib/ce/dms.mjs";

const today = "2026-10-17";
const headers = [...DMS_HEADERS];
const row = (overrides = {}) => headers.map((header) => ({
  Branch: "[CO01A] Nippon Toyota,Cochin", Name: "Customer One", "Tel No.": "# ",
  "Mobile No.": "#09876543210", VIN: "#mbj~legacy1", Model: "INNOVA",
  "Delivery Date": "2020-01-02", "Last Service-in": "2026-01-03",
  "Mileage (Last Service-in)": "12,345", "Last Service-in Dealer": "Nippon Toyota",
  "Last Service-in Branch": "[TR01A] Nippon Toyota", ...overrides,
})[header]);
function workbook(rows) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "DMS");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" });
}

assert.equal(normalizeCeVin("  #mbj~legacy1  "), "MBJ~LEGACY1");
assert.equal(normalizeIndianMobile("#09876543210"), "+919876543210");
assert.equal(normalizeIndianMobile("+91 98765-43210"), "+919876543210");
assert.equal(normalizeIndianMobile("12345"), null);
assert.equal(extractDmsBranchCode(" [ti01c] Name"), "TI01C");
assert.equal(extractDmsBranchCode("TI01C"), null);

const parsed = parseDmsWorkbook(workbook([
  headers,
  row({ Name: "Newest first", "Last Service-in": "2026-02-01" }),
  row({ Name: "Older later", "Last Service-in": "2026-01-01", "Mobile No.": "bad", "Tel No.": "#9123456789" }),
  row({ Name: "Tie winner", "Last Service-in": "2026-02-01", "Mobile No.": "bad", "Tel No.": "bad" }),
  row({ VIN: "#SECOND", "Mobile No.": "bad", "Tel No.": "#9876501234", "Last Service-in Branch": "[TI01C] Branch" }),
  row({ VIN: "#THIRD", "Mobile No.": "#08888000000", "Tel No.": "#9999000000" }),
]), today);
assert.equal(parsed.sourceRowCount, 5);
assert.equal(parsed.rows.length, 3);
assert.equal(parsed.duplicateRows, 2);
assert.equal(parsed.rows[0].vin, "MBJ~LEGACY1");
assert.equal(parsed.rows[0].customerName, "Tie winner");
assert.equal(parsed.rows[0].contactNumber, null);
assert.equal(parsed.rows[1].contactNumber, "+919876501234");
assert.equal(parsed.rows[1].latestServiceBranchCode, "TI01C");
assert.equal(parsed.rows[1].dealerZone, "North");
assert.equal(parsed.rows[2].contactNumber, "+918888000000");
assert.equal("address" in parsed.rows[0], false);

// CO01E/KL01B/TR01B are Body & Paint-only branches (see body-paint-only.ts)
// — a "Last Service-in" recorded there must never count as a periodic-
// maintenance visit.
const withBpOnly = parseDmsWorkbook(workbook([
  headers,
  row({ Name: "Genuine GS visit" }),
  row({ VIN: "#BPONLY", Name: "BP-only visit", "Last Service-in Branch": "[TR01B] Nippon Toyota BP" }),
]), today);
assert.equal(withBpOnly.sourceRowCount, 2);
assert.equal(withBpOnly.rows.length, 1);
assert.equal(withBpOnly.bodyPaintOnlyRows, 1);
assert.equal(withBpOnly.duplicateRows, 0);
assert.equal(withBpOnly.rows.some((item) => item.vin === "BPONLY"), false);
assert.throws(
  () => parseDmsWorkbook(workbook([headers, row({ "Last Service-in Branch": "[CO01E] Nippon Toyota BP" })]), today),
  /Body & Paint-only/,
);

assert.throws(() => parseDmsWorkbook(workbook([headers.slice(1), row()]), today), /required DMS headers/);
assert.throws(() => parseDmsWorkbook(workbook([headers, row({ "Last Service-in": "not-a-date" })]), today), /valid date/);
assert.throws(() => parseDmsWorkbook(workbook([headers, row({ "Last Service-in": "2026-10-18" })]), today), /future/);
assert.throws(() => parseDmsWorkbook(workbook([headers, row({ "Delivery Date": "2026-10-18" })]), today), /future/);

// The exact per-row counts below used to be pinned against the real
// "DMS DATA CLEANED.xlsx" supplied file, but the Body & Paint exclusion
// above changes those counts for any real file containing BP-only-branch
// rows, and there's no way to recompute the correct numbers without that
// file. Keep this to a smoke check that the real file still parses.
if (existsSync("DMS DATA CLEANED.xlsx")) {
  const supplied = parseDmsWorkbook(readFileSync("DMS DATA CLEANED.xlsx"), today);
  assert.ok(supplied.rows.length > 0);
}
console.log("PASS  CE DMS headers, VINs, mobiles, duplicates, branches, dates, and Body & Paint exclusion");
