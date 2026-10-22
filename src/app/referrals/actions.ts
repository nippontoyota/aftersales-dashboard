"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/auth";
import { loadCallHistory, markConnected, markNotConnected, type InactiveReferralCallRow } from "@/lib/inactive-referrals/store";

export type ReferralActionState = { error: string | null; ok: boolean };

function requireBranchAdmin(admin: Awaited<ReturnType<typeof getCurrentAdmin>>) {
  if (!admin || admin.role !== "branch") return null;
  return admin;
}

function requiredRemark(formData: FormData): string | null {
  const remark = String(formData.get("remark") ?? "").trim();
  return remark ? remark : null;
}

export async function markNotConnectedAction(_prev: ReferralActionState, formData: FormData): Promise<ReferralActionState> {
  const admin = requireBranchAdmin(await getCurrentAdmin());
  if (!admin) return { error: "Not allowed.", ok: false };

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id) || id <= 0) return { error: "Bad referral id.", ok: false };
  const remark = requiredRemark(formData);
  if (!remark) return { error: "A remark is required.", ok: false };

  try {
    await markNotConnected(id, admin.branch, admin.username, remark);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't update that referral.", ok: false };
  }
  revalidatePath("/referrals");
  return { error: null, ok: true };
}

export async function markConnectedAction(_prev: ReferralActionState, formData: FormData): Promise<ReferralActionState> {
  const admin = requireBranchAdmin(await getCurrentAdmin());
  if (!admin) return { error: "Not allowed.", ok: false };

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id) || id <= 0) return { error: "Bad referral id.", ok: false };
  const remark = requiredRemark(formData);
  if (!remark) return { error: "A remark is required.", ok: false };

  try {
    await markConnected(id, admin.branch, admin.username, remark);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't update that referral.", ok: false };
  }
  revalidatePath("/referrals");
  return { error: null, ok: true };
}

/** The detail view's call-history list — branch-only, same as the page itself. */
export async function getCallHistoryAction(referralId: number): Promise<InactiveReferralCallRow[]> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== "branch") return [];
  if (!Number.isFinite(referralId) || referralId <= 0) return [];
  return loadCallHistory(referralId);
}
