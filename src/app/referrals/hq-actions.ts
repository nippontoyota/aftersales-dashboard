"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/auth";
import { markPayoutPaid } from "@/lib/inactive-referrals/store";
import { rescanUnmatchedInactiveReferrals } from "@/lib/inactive-referrals/ro-matcher";

function requireHqAccess(admin: Awaited<ReturnType<typeof getCurrentAdmin>>) {
  if (!admin || admin.role !== "hq") return null;
  return admin;
}

export type RescanState = { error: string | null; matchedCount: number | null };

/** The RO-match backstop button — re-checks every branch-entered pending RO
 * number against every saved GS Service Info row, not just the next
 * upload. See ro-matcher.ts's rescanUnmatchedInactiveReferrals(). */
export async function rescanUnmatchedReferralsAction(_prev: RescanState): Promise<RescanState> {
  const admin = requireHqAccess(await getCurrentAdmin());
  if (!admin) return { error: "Not allowed.", matchedCount: null };

  try {
    const matched = await rescanUnmatchedInactiveReferrals();
    revalidatePath("/referrals");
    return { error: null, matchedCount: matched.length };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Re-scan failed.", matchedCount: null };
  }
}

export type MarkPaidState = { error: string | null; ok: boolean };

/** HQ settling a payout ledger row — records the payment so it nets off
 * that employee's amountOwed on the next load, see loadPayoutLedger/
 * markPayoutPaid in store.ts. */
export async function markPayoutPaidAction(_prev: MarkPaidState, formData: FormData): Promise<MarkPaidState> {
  const admin = requireHqAccess(await getCurrentAdmin());
  if (!admin) return { error: "Not allowed.", ok: false };

  const employeeId = (formData.get("employeeId") as string) || null;
  const employeeName = (formData.get("employeeName") as string) || null;
  const employeeBranch = (formData.get("employeeBranch") as string) || null;
  const amount = Number(formData.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Bad amount.", ok: false };

  await markPayoutPaid(employeeId, employeeName, employeeBranch, amount, admin.username);
  revalidatePath("/referrals");
  return { error: null, ok: true };
}
