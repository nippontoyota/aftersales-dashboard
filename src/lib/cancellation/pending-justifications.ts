import type { AdminAccount } from "../admin-store";
import { REGIONS } from "../regions";
import { reconcileCancellations } from "./reconcile";
import { loadCancellationMonths } from "./store";
import { isJustificationOverdue, justificationStatus, loadJustifications } from "./justifications";

/** How many of the most recent cancellation months to check — the sidebar
 * badge's scope. Deliberately bounded (not "all of history") for the same
 * cost reason cancellation-flag.tsx's banner is scoped to the latest month
 * alone; 2 covers "this month + last month" (e.g. Nov + Oct) without an
 * unbounded scan as old months pile up. */
const MONTHS_CHECKED = 2;

/**
 * Sidebar badge count on the Cancellations nav item — "how many flagged
 * cancellations need *this viewer's* action right now", across the last
 * couple of months, so a case doesn't go unnoticed just because nobody
 * happened to open /cancellations. What counts as "needs action" differs by
 * role, mirroring justification-box.tsx's own per-role rendering:
 *   - branch: no justification submitted yet (their move)
 *   - regional: branch has submitted, awaiting their co-sign (their move)
 *   - HQ/HQ viewer/BP HO: overdue (past the 3-day grace period) — HQ has no
 *     required action otherwise, so only the escalated ones surface here,
 *     same as the "escalated to HQ" wording already used on the page.
 */
export async function countPendingJustifications(admin: AdminAccount): Promise<number> {
  if (admin.role !== "hq" && admin.role !== "hq_viewer" && admin.role !== "bp_ho" && admin.role !== "branch" && admin.role !== "regional") {
    return 0;
  }

  const scope = admin.role === "branch" ? admin.branch : undefined;
  const months = (await loadCancellationMonths(scope)).slice(0, MONTHS_CHECKED);
  if (months.length === 0) return 0;

  const scopeBranches = admin.role === "regional" ? new Set<string>(REGIONS[admin.region]) : null;

  const counts = await Promise.all(
    months.map(async (month) => {
      const result = await reconcileCancellations(month, scope);
      const flagged = result.rows.filter((r) => r.flagged && (!scopeBranches || scopeBranches.has(r.branch)));
      if (flagged.length === 0) return 0;

      const justifications = await loadJustifications(flagged.map((r) => r.docNo));

      if (admin.role === "branch") {
        return flagged.filter((r) => justificationStatus(justifications.get(r.docNo)) === "none").length;
      }
      if (admin.role === "regional") {
        return flagged.filter((r) => justificationStatus(justifications.get(r.docNo)) === "branch_submitted").length;
      }
      // hq / hq_viewer / bp_ho
      return flagged.filter((r) => isJustificationOverdue(r.cancelAt, justifications.get(r.docNo))).length;
    }),
  );

  return counts.reduce((s, n) => s + n, 0);
}
