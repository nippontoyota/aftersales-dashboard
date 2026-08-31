/**
 * Accessories department staff name-matching — pure, no DB dependency of
 * its own. The actual staff list now lives in the `accessories_staff`
 * table (see accessories-staff-store.ts), editable by HQ at /data; the
 * caller (an SSRV089 upload route) fetches one branch's names once per
 * upload and passes them in here, so this stays a plain function usable
 * inside ssrv089/parse.ts's per-row loop without an async DB call per row.
 */
function normalizeName(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

export function isAccessoriesStaff(staffNames: string[], closeSaName: string): boolean {
  const target = normalizeName(closeSaName);
  return staffNames.some((name) => normalizeName(name) === target);
}
