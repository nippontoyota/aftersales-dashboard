import Link from "next/link";
import { REGIONS } from "@/lib/regions";
import type { AdminAccount } from "@/lib/admin-store";
import { loadCancellationMonths } from "@/lib/cancellation/store";
import { reconcileCancellations } from "@/lib/cancellation/reconcile";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
};

/**
 * The passive reconciliation flag, surfaced on the Alerts page — "N
 * cancellations may still be in <month>'s figures", linking to the full
 * Cancellations view. Renders nothing when there's no uploaded report or
 * nothing is flagged.
 */
export async function CancellationFlag({ admin }: { admin: AdminAccount }) {
  const scope = admin.role === "branch" ? admin.branch : undefined;
  const months = await loadCancellationMonths(scope);
  if (months.length === 0) return null;

  const month = months[0];
  const result = await reconcileCancellations(month, scope);

  const scopeBranches =
    admin.role === "regional" ? new Set(REGIONS[admin.region] as readonly string[]) : null;
  const flagged = result.rows.filter((r) => r.flagged && (!scopeBranches || scopeBranches.has(r.branch)));
  if (flagged.length === 0) return null;

  const value = flagged.reduce((s, r) => s + r.beforeTax, 0);

  return (
    <Link
      href={`/cancellations?month=${month}`}
      className="mt-3 flex items-center gap-2 rounded-md border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad hover:bg-bad-soft/80"
    >
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4 shrink-0" aria-hidden="true">
        <circle cx="10" cy="10" r="7" />
        <path d="M5.5 5.5l9 9" strokeLinecap="round" />
      </svg>
      <span>
        {flagged.length} cancellation{flagged.length === 1 ? "" : "s"} ({inr(value)} before tax) may still be in{" "}
        {monthLabel(month)}&apos;s figures — review
      </span>
    </Link>
  );
}
