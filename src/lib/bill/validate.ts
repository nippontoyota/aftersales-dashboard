type ParseOk  = { ok: true; value: number };
type ParseErr = { ok: false; error: string };

/**
 * Strict parser for a taxable-value string arriving from the bill upload
 * form's `type="number" step="0.01"` input.
 *
 * Accepts:  plain positive decimals with at most 2 decimal places
 *             "1203"  "1203.00"  "22903.68"  "144265"
 * Rejects:
 *   – negative sign        "-50000"    → parseFloat would have accepted this
 *   – alpha suffix         "500abc"    → parseFloat returns 500 (wrong)
 *   – "Infinity"           the word    → parseFloat returns Infinity
 *   – scientific notation  "1e5"       → parseFloat returns 100000
 *   – comma separators     "1,203.00"  → parseFloat returns 1 (wrong)
 *   – more than 2 decimals "1203.001"  → sub-paise precision, likely a mistake
 *   – zero / negative      "0"  "0.00"
 *
 * No upper ceiling is applied here — 53 bills is too small a sample to
 * establish a reliable maximum, and a cap that only gates manual entries
 * would be inconsistently enforced. The DB constraint (taxable_value > 0)
 * is the permanent safety net for both manual and auto-extracted paths.
 */
export function parseStrictPositiveAmount(s: string): ParseOk | ParseErr {
  // Digits with at most one decimal point followed by 1–2 digits — nothing else.
  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    return { ok: false, error: "Taxable value must be a positive number with at most 2 decimal places (e.g. 1203.00)." };
  }
  const v = Number(s);
  if (v <= 0) {
    return { ok: false, error: "Taxable value must be greater than zero." };
  }
  return { ok: true, value: v };
}
