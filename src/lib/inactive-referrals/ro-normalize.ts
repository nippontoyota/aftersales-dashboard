/** RO ("Job Order No") comparison for 3C Referrals — unlike BP Referrals'
 * fixed "BPJ" prefix convention, a Service Info Report's Job Order No has no
 * fixed prefix, so this only strips whitespace/dashes and upper-cases
 * before comparing. */
export function normalizeRoNo(ro: string): string {
  return ro.trim().toUpperCase().replace(/[\s-]/g, "");
}

/** The equivalent SQL expression, for the per-upload matcher's set-based
 * query — keep in sync with normalizeRoNo above by hand. */
export const NORMALIZE_RO_SQL = (expr: string) => `regexp_replace(${expr}, '[\\s-]', '', 'g')`;
