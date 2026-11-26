"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/auth";
import { listBranchCodes } from "@/lib/admin-store";
import { assignBranch, markPayoutPaid } from "@/lib/bp-referrals/store";
import { rescanUnmatchedReferrals } from "@/lib/bp-referrals/ro-matcher";

export type BpHoActionState = { error: string | null; ok: boolean };

function requireBpHoAccess(admin: Awaited<ReturnType<typeof getCurrentAdmin>>) {
  if (!admin || (admin.role !== "bp_ho" && admin.role !== "hq")) return null;
  return admin;
}

/** BP HO manually resolving a referral whose free-text branch never
 * matched anything (see branch-match.ts) — the only way such a referral
 * ever becomes visible to a BPM's queue. */
export async function assignBranchAction(_prev: BpHoActionState, formData: FormData): Promise<BpHoActionState> {
  const admin = requireBpHoAccess(await getCurrentAdmin());
  if (!admin) return { error: "Not allowed.", ok: false };

  const id = Number(formData.get("id"));
  const branch = String(formData.get("branch") ?? "").trim();
  if (!Number.isFinite(id) || id <= 0) return { error: "Bad referral id.", ok: false };
  if (!branch) return { error: "Pick a branch.", ok: false };

  const validCodes = await listBranchCodes();
  if (!validCodes.includes(branch)) return { error: "Unknown branch.", ok: false };

  await assignBranch(id, branch);
  revalidatePath("/bp-referrals");
  return { error: null, ok: true };
}

export type RescanState = { error: string | null; matchedCount: number | null };

/** The RO-match backstop button — re-checks every BPM-entered pending RO
 * number against every saved Cost & Sales Report - BP row, not just the next
 * upload. See ro-matcher.ts's rescanUnmatchedReferrals(). */
export async function rescanUnmatchedReferralsAction(_prev: RescanState): Promise<RescanState> {
  const admin = requireBpHoAccess(await getCurrentAdmin());
  if (!admin) return { error: "Not allowed.", matchedCount: null };

  try {
    const matched = await rescanUnmatchedReferrals();
    revalidatePath("/bp-referrals");
    return { error: null, matchedCount: matched.length };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Re-scan failed.", matchedCount: null };
  }
}

export type MarkPaidState = { error: string | null; ok: boolean };

/** BP HO/HQ settling a payout ledger row — records the payment so it nets
 * off that employee's amountOwed on the next load, see
 * loadPayoutLedger/markPayoutPaid in store.ts. The amount is whatever the
 * ledger row currently shows as owed at submit time (passed through as a
 * hidden field by the form, see PayoutLedger's "Mark paid" button), not
 * re-derived here, so a payment always matches what BP HO saw on screen. */
export async function markPayoutPaidAction(_prev: MarkPaidState, formData: FormData): Promise<MarkPaidState> {
  const admin = requireBpHoAccess(await getCurrentAdmin());
  if (!admin) return { error: "Not allowed.", ok: false };

  const employeeId = (formData.get("employeeId") as string) || null;
  const employeeName = (formData.get("employeeName") as string) || null;
  const employeeBranch = (formData.get("employeeBranch") as string) || null;
  const amount = Number(formData.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Bad amount.", ok: false };

  await markPayoutPaid(employeeId, employeeName, employeeBranch, amount, admin.username);
  revalidatePath("/bp-referrals");
  return { error: null, ok: true };
}
