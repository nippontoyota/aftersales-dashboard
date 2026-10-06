/**
 * Human-readable branch name by code — the same city/site names already
 * recorded as comments in branch-tier.ts (provided by the user, 2026-08-31).
 * "BP" suffixes distinguish a Body & Paint-only branch from the main branch
 * in the same city (e.g. CO01B "Kalamassery" vs CO01E "Kalamassery BP").
 * CO01C has no physical site (it's the online store — see report.ts's
 * ONLINE_STORE_PARENT_BRANCH) and CO01D is deactivated, so neither is in
 * branch-tier.ts; CO01C is named directly here since it does still appear in
 * some UI (e.g. the heatmap's online-store breakdown row).
 */
export const BRANCH_NAMES: Record<string, string> = {
  TI01A: "Thrissur",
  TI01B: "Nadathara",
  TI01C: "Kunnamkulam",
  IR01A: "Iringalakuda",
  KT01A: "Kottayam",
  KT01B: "Pala",
  TL01A: "Thiruvalla",
  CO01A: "Nettoor",
  CO01B: "Kalamassery",
  CO01E: "Kalamassery BP",
  KY01A: "Kayamkulam",
  MV01A: "Muvattupuzha",
  PH01A: "Pathanamthitta",
  KL01A: "Kollam 3S",
  KL01B: "Thazhuthala BP",
  TR01A: "Kazhakkottam",
  TR01B: "Kochuveli BP",
  TR01C: "Enchakkal",
  CO01C: "Online Store",
};

/** Falls back to the raw code for anything not listed above (shouldn't
 * happen with real branch codes, but keeps an unlisted code visible instead
 * of blank). */
export function branchName(code: string): string {
  return BRANCH_NAMES[code] ?? code;
}
