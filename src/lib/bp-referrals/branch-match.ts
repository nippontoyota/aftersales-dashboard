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
};

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/** Resolves a free-text location name to a branch code, or null if it
 * doesn't match any known branch name. Case-insensitive, trims whitespace. */
export function resolveBranchCode(rawText: string | null | undefined): string | null {
  if (!rawText) return null;
  const normalized = normalize(rawText);
  if (!normalized) return null;
  if (NAME_OVERRIDE[normalized]) return NAME_OVERRIDE[normalized];
  for (const [code, name] of Object.entries(BRANCH_NAMES)) {
    if (normalize(name) === normalized) return code;
  }
  return null;
}
