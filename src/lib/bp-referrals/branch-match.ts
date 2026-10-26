import { BRANCH_NAMES } from "@/lib/branch-names";

/**
 * The WhatsApp bot that feeds bp_referrals captures the employee's branch as
 * free text (e.g. "Kalamassery"), not a branch code — this resolves that
 * text to a branch code using the same display names already shown
 * throughout the dashboard (see branch-names.ts).
 *
 * Kalamassery is the one place with two branches sharing the exact same
 * display name — CO01B (general) and CO01E ("Kalamassery BP"). Per the
 * user's decision (2026-10-14), a BP referral from that location always
 * routes to the dedicated BP branch when one exists, so it's special-cased
 * here rather than resolved by a generic "prefer the BP-only sibling" rule
 * (every other branch name in BRANCH_NAMES is unique, so no such rule is
 * actually needed elsewhere).
 */
const NAME_OVERRIDE: Record<string, string> = {
  kalamassery: "CO01E",
  // The WhatsApp bot sends the common spelling "Irinjalakuda"; BRANCH_NAMES
  // has IR01A recorded as "Iringalakuda" (the user's own naming, set
  // 2026-08-31 — not a typo to "fix" there), so the two never match as text.
  irinjalakuda: "IR01A",
};

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/** Resolves a free-text location name to a branch code with no special
 * casing — plain first-match-wins against BRANCH_NAMES (CO01B, the general
 * branch, comes before CO01E in that map, so "Kalamassery" alone lands on
 * CO01B). Used anywhere the BP-specific override below doesn't apply — see
 * resolveBranchCode(). */
export function resolveBranchCodeByName(rawText: string | null | undefined): string | null {
  if (!rawText) return null;
  const normalized = normalize(rawText);
  if (!normalized) return null;
  for (const [code, name] of Object.entries(BRANCH_NAMES)) {
    if (normalize(name) === normalized) return code;
  }
  return null;
}

/** Same as resolveBranchCodeByName, but a BP referral from Kalamassery
 * always routes to the dedicated BP branch (CO01E) when one exists — see
 * the NAME_OVERRIDE comment above. BP-referral-specific; anything that
 * isn't about the body-shop referral program should use
 * resolveBranchCodeByName() directly instead. */
export function resolveBranchCode(rawText: string | null | undefined): string | null {
  if (!rawText) return null;
  const normalized = normalize(rawText);
  if (!normalized) return null;
  if (NAME_OVERRIDE[normalized]) return NAME_OVERRIDE[normalized];
  return resolveBranchCodeByName(rawText);
}
