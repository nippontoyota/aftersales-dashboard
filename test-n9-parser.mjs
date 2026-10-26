import assert from "node:assert/strict";
import { N9_HEADERS, parseN9List } from "./src/lib/ce/n9.mjs";

const today = "2026-10-22";
const headers = [...N9_HEADERS];

function csvField(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

/** Builds a UTF-16LE buffer in the real export's shape: tab-delimited,
 * quoted fields, and a mix of "\r\n" and bare "\r" row terminators (the
 * real bug this parser exists to handle — see parseTabDelimited's doc
 * comment in n9.mjs). `terminators[i]` is the separator written after
 * row i (defaults to "\r\n"). */
function workbook(rows, terminators = []) {
  const lines = [headers.join("\t"), ...rows.map((row) => headers.map((h) => csvField(row[h] ?? "")).join("\t"))];
  let text = "";
  for (let i = 0; i < lines.length; i++) {
    text += lines[i];
    if (i < lines.length - 1) text += i === 0 ? "\r\n" : terminators[i - 1] ?? "\r\n";
  }
  return Buffer.from(text, "utf16le");
}

const row = (overrides = {}) => ({
  "DM Planned Date": "2026/10/13", "DM Data Extract Date": "2026/10/13", "Customer Name": "Customer One",
  "Mobile No.": "#09876543210", "Rego#": "KL07AB1234", "Vehicle Name": "INNOVA", VIN: "#mbj~legacy1",
  "Vehicle Sales Type": "Service Only", "i-CROP Next Recommended Name": "MRS_10K_MODELS( 12 Months )",
  "i-CROP Next Recommended Date": "2026/10/22", "Activity Category": "1", "Activity Cat2 Reason": "Active for Plan",
  "1st CALL Planned Date": "2026/10/15", ...overrides,
});

// Bare "\r" (no "\n") between two records — the exact pattern found in the
// real 2026-10-22 export — must still split into two rows, not one.
const withBareCr = parseN9List(workbook([
  row({ VIN: "#FIRST", "Customer Name": "First Customer" }),
  row({ VIN: "#SECOND", "Customer Name": "Second Customer" }),
], ["\r"]), today);
assert.equal(withBareCr.rows.length, 2);
assert.equal(withBareCr.rows[0].vin, "FIRST");
assert.equal(withBareCr.rows[1].vin, "SECOND");
assert.equal(withBareCr.rows[1].customerName, "Second Customer");

const parsed = parseN9List(workbook([
  row({ VIN: "#AAA111", "i-CROP Next Recommended Date": "N/A" }),
  row({ VIN: "#BBB222", "Mobile No.": "bad", "Activity Cat2 Reason": "" }),
  row({ VIN: "#CCC333", "Rego#": "REGNO" }),
]), today);
assert.equal(parsed.sourceRowCount, 3);
assert.equal(parsed.rows.length, 3);
assert.equal(parsed.extractDate, "2026-10-13");
assert.equal(parsed.rows[0].icropRecommendedDate, null);
assert.equal(parsed.rows[1].mobileNumber, null);
assert.equal(parsed.rows[1].activityCat2Reason, null);
assert.equal(parsed.rows[2].registrationNo, "REGNO");
assert.equal(parsed.rows[0].dmPlannedDate, "2026-10-13");
assert.equal(parsed.rows[0].firstCallPlannedDate, "2026-10-15");

assert.throws(() => parseN9List(workbook([row({ VIN: "" })]), today), /VIN is required/);
assert.throws(() => parseN9List(workbook([row({ "DM Planned Date": "not-a-date" })]), today), /valid YYYY\/MM\/DD/);
assert.throws(() => parseN9List(workbook([row({ "DM Data Extract Date": "2026/10/23" })]), today), /future/);
assert.throws(
  () => parseN9List(workbook([row(), row({ VIN: "#OTHER", "DM Data Extract Date": "2026/10/14" })]), today),
  /does not match the file's extract date/,
);
assert.throws(
  () => parseN9List(Buffer.from([...headers.slice(1), "x"].join("\t"), "utf16le"), today),
  /required N-9 headers/,
);

console.log("PASS  N-9 headers, VINs, dates, bare-\\r line endings, and extract-date consistency");
