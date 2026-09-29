/**
 * Tests for parseStrictPositiveAmount — the taxable-value validator used by
 * the bill upload route.
 *
 * Covers the M2 audit cases plus two-decimal precision:
 *   – negative value        "-50000"
 *   – zero                  "0"
 *   – numeric prefix        "500abc"
 *   – Infinity              "Infinity"
 *   – normal value          "1203.00"
 *   – three+ decimal places "1203.001"  (sub-paise — rejected)
 *   – large valid value     "500000"    (no upper ceiling)
 *
 * Run: npx tsx test-bill-taxable-value.ts
 */
import { parseStrictPositiveAmount } from "./src/lib/bill/validate.ts";

let passed = 0;
let failed = 0;

function testOk(name: string, input: string, expectedValue: number) {
  const result = parseStrictPositiveAmount(input);
  if (result.ok && result.value === expectedValue) {
    console.log(`PASS  ${name}`);
    passed++;
  } else if (result.ok) {
    console.error(`FAIL  ${name}: got value ${result.value}, expected ${expectedValue}`);
    failed++;
  } else {
    console.error(`FAIL  ${name}: expected ok but got error: "${result.error}"`);
    failed++;
  }
}

function testErr(name: string, input: string) {
  const result = parseStrictPositiveAmount(input);
  if (!result.ok) {
    console.log(`PASS  ${name}  → "${result.error}"`);
    passed++;
  } else {
    console.error(`FAIL  ${name}: expected error but got value ${result.value}`);
    failed++;
  }
}

// ── Should REJECT ─────────────────────────────────────────────────────────────

testErr("negative value        \"-50000\"",    "-50000");
testErr("zero                  \"0\"",          "0");
testErr("zero decimal          \"0.00\"",       "0.00");
testErr("numeric prefix        \"500abc\"",     "500abc");
testErr("Infinity              \"Infinity\"",   "Infinity");
testErr("negative float        \"-0.50\"",      "-0.50");
testErr("scientific notation   \"1e5\"",        "1e5");
testErr("comma-formatted       \"1,203.00\"",   "1,203.00");
testErr("empty string          \"\"",           "");
testErr("whitespace only       \" \"",          " ");
testErr("three decimal places  \"1203.001\"",   "1203.001");
testErr("four decimal places   \"1203.0001\"",  "1203.0001");

// ── Should ACCEPT ─────────────────────────────────────────────────────────────

testOk("normal invoice value   \"1203.00\"",   "1203.00",   1203);
testOk("no decimals            \"22903\"",     "22903",     22903);
testOk("one decimal place      \"1203.5\"",   "1203.5",    1203.5);
testOk("two decimal places     \"1203.55\"",  "1203.55",   1203.55);
testOk("one paise              \"0.01\"",      "0.01",      0.01);
testOk("large valid value      \"500000\"",    "500000",    500000);
testOk("very large value       \"1000000\"",   "1000000",   1000000);
testOk("larger round value     \"250000\"",    "250000",    250000);

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exitCode = 1;
