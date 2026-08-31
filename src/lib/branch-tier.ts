/**
 * City tier (A/B) per branch — determines which T-Gloss retail price a
 * branch's VAS sales get matched against (see vas-price-list.ts). Provided
 * directly by the user, 2026-08-31. CO01E (Kalamassery Body & Paint) has no
 * VAS sales of its own (it doesn't upload a Service Info Report), but is
 * included here for completeness since it shares CO01B's city.
 */
export type CityTier = "A" | "B";

export const BRANCH_TIER: Record<string, CityTier> = {
  TI01A: "A", // Thrissur
  TI01B: "A", // Nadathara
  TI01C: "A", // Kunnamkulam
  IR01A: "A", // Iringalakuda
  KT01A: "B", // Kottayam
  KT01B: "B", // Pala
  TL01A: "B", // Thiruvalla
  CO01A: "A", // Nettoor
  CO01B: "A", // Kalamassery
  CO01E: "A", // Kalamassery BP
  KY01A: "B", // Kayamkulam
  MV01A: "A", // Muvattupuzha
  PH01A: "B", // Pathanamthitta
  KL01A: "A", // Kollam 3S
  KL01B: "A", // Thazhuthala BP
  TR01A: "A", // Kazhakkottam
  TR01B: "A", // Kochuveli BP
  TR01C: "A", // Enchakkal
};

export function tierForBranch(branch: string): CityTier | null {
  return BRANCH_TIER[branch] ?? null;
}
