import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { CE_HEADERS, parseCeWorkbook } from "./src/lib/ce/parse.ts";
import { categoryForAge, indiaDate, nextIndiaMidnight } from "./src/lib/ce/rules.ts";

assert.equal(categoryForAge(364), "hot");
assert.equal(categoryForAge(365), "warm");
assert.equal(categoryForAge(730), "warm");
assert.equal(categoryForAge(731), "cold");
assert.equal(indiaDate(new Date("2026-10-16T18:29:59.999Z")), "2026-10-16");
assert.equal(indiaDate(new Date("2026-10-16T18:30:00.000Z")), "2026-10-17");
assert.equal(nextIndiaMidnight(Date.parse("2026-10-17T12:00:00Z")), Date.parse("2026-10-17T18:30:00Z"));

if (existsSync("UIO.xlsx")) {
  const parsed = parseCeWorkbook(readFileSync("UIO.xlsx"), "2026-10-17");
  assert.equal(parsed.rows.length, 8_798);
  assert.equal(parsed.minReportDate, "2024-01-01");
  assert.equal(parsed.maxReportDate, "2025-09-30");
  const counts = { hot: 0, warm: 0, cold: 0 };
  for (const row of parsed.rows) {
    const age = (Date.parse("2026-10-17T00:00:00Z") - Date.parse(`${row.nReportDate}T00:00:00Z`)) / 86_400_000;
    counts[categoryForAge(age)]++;
  }
  assert.deepEqual(counts, { hot: 0, warm: 6_713, cold: 2_085 });
}

const validRow = ["CO01A", "SOUTH 1", "VIN1", "GR001", "2020-01-01", 2020, "CO01A", "CO01A", 1, "2025-01-01", 100, "CO01A", "2024-01-01", 90, "CO01A", 80, "2023-01-01", "A", "B"];
function workbook(rows: unknown[][]) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "UIO");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" });
}
assert.throws(() => parseCeWorkbook(workbook([[...CE_HEADERS.slice(1)], validRow]), "2026-10-17"), /required UIO headers/);
assert.throws(() => parseCeWorkbook(workbook([CE_HEADERS as unknown as string[], validRow, validRow]), "2026-10-17"), /duplicate VIN/);
const badDate = [...validRow]; badDate[9] = "not-a-date";
assert.throws(() => parseCeWorkbook(workbook([CE_HEADERS as unknown as string[], badDate]), "2026-10-17"), /valid date/);
const future = [...validRow]; future[9] = "2026-10-18";
assert.throws(() => parseCeWorkbook(workbook([CE_HEADERS as unknown as string[], future]), "2026-10-17"), /future/);

console.log("PASS  CE category, India rollover, and workbook parser checks");
