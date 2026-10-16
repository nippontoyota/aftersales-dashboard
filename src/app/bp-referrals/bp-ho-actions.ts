"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/auth";
import { listBranchCodes } from "@/lib/admin-store";
import { assignBranch } from "@/lib/bp-referrals/store";
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

/** The RO-match backstop button — re-scans every saved Cost & Sales Report
 * - BP row for a match, not just the next upload. See ro-matcher.ts's
 * rescanUnmatchedReferrals(). */
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
