/** Shared by every place that compares a BPM-entered RO/Job Order number
 * against the DMS's own Cost & Sales - BP export — store.ts's enterRoNumber
 * (match-on-entry), and ro-matcher.ts's upload-time and rescan matchers.
 *
 * The DMS always formats these as BPJ{YY}-{NNNNN} (e.g. "BPJ26-04957"), but
 * the queue's "enter RO" field only ever collects digits after a fixed
 * "BPJ" tag with no dash, so every BPM-typed value looks like "BPJ2604957"
 * — a plain uppercase/trim compare against the DMS value never matched a
 * single referral (2026-11-09: confirmed zero referrals had ever matched
 * before this fix, across the 26 then-pending RO entries). Strip spaces and
 * dashes from both sides before comparing, same idea as the vehicle-reg-no
 * normalization already used throughout this feature.
 *
 * Also collapses an accidentally doubled "BPJ" prefix — a BPM typing the
 * full RO, dash and all, into the suffix-only field produces "BPJBPJ..."
 * once the form prepends its own fixed "BPJ" on top (see EnterRoInlineForm
 * in bpm-queue-client.tsx, fixed the same day) — so any already-saved bad
 * entries still match without needing a manual data correction first. */
export function normalizeRoNo(ro: string): string {
  const stripped = ro.trim().toUpperCase().replace(/[\s-]/g, "");
  return stripped.startsWith("BPJBPJ") ? stripped.slice(3) : stripped;
}

/** The equivalent SQL expression, for queries that normalize a jsonb/text
 * column server-side instead of pulling rows into JS first — keep in sync
 * with normalizeRoNo above by hand. `expr` must already be upper-cased. */
export const NORMALIZE_RO_SQL = (expr: string) => `replace(regexp_replace(${expr}, '[\\s-]', '', 'g'), 'BPJBPJ', 'BPJ')`;
