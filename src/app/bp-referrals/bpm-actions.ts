"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/auth";
import { listBranchCodes } from "@/lib/admin-store";
import {
  loadActivityForReferral,
  loadOverdueFollowUps,
  loadUrgentUnconnected,
  logFollowUpContact,
  markNotConnected,
  submitCallOutcome,
  transferReferral,
  type ActivityRow,
  type BpReferralRow,
  type CallOutcome,
} from "@/lib/bp-referrals/store";

export type BpmActionState = { error: string | null; ok: boolean };

function requireBpManager(admin: Awaited<ReturnType<typeof getCurrentAdmin>>) {
  if (!admin || admin.role !== "bp_manager") return null;
  return admin;
}

function requiredRemark(formData: FormData): string | null {
  const remark = String(formData.get("remark") ?? "").trim();
  return remark ? remark : null;
}

export async function markNotConnectedAction(_prev: BpmActionState, formData: FormData): Promise<BpmActionState> {
  const admin = requireBpManager(await getCurrentAdmin());
  if (!admin) return { error: "Not allowed.", ok: false };

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id) || id <= 0) return { error: "Bad referral id.", ok: false };
  const remark = requiredRemark(formData);
  if (!remark) return { error: "A reason is required.", ok: false };

  try {
    await markNotConnected(id, admin.branch, admin.username, remark);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't update that referral.", ok: false };
  }
  revalidatePath("/bp-referrals");
  return { error: null, ok: true };
}

/** The one-form call outcome — genuine, estimate, interested, CP/IP, and a
 * mandatory remark, all submitted together once the BPM actually connects
 * with the customer. */
export async function submitCallOutcomeAction(_prev: BpmActionState, formData: FormData): Promise<BpmActionState> {
  const admin = requireBpManager(await getCurrentAdmin());
  if (!admin) return { error: "Not allowed.", ok: false };

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id) || id <= 0) return { error: "Bad referral id.", ok: false };
  const remark = requiredRemark(formData);
  if (!remark) return { error: "A remark is required.", ok: false };

  const genuine = formData.get("genuine") === "yes";
  let outcome: CallOutcome;

  if (!genuine) {
    outcome = { genuine: false };
  } else {
    const estimateRaw = String(formData.get("estimateAmount") ?? "").trim();
    const estimateAmount = Number(estimateRaw);
    if (!estimateRaw || !Number.isFinite(estimateAmount) || estimateAmount < 0) {
      return { error: "Enter a valid estimate amount.", ok: false };
    }
    const interested = formData.get("customerInterested") === "yes";
    if (!interested) {
      outcome = { genuine: true, estimateAmount, customerInterested: false };
    } else {
      const paymentType = String(formData.get("paymentType") ?? "");
      if (paymentType !== "CP" && paymentType !== "IP") {
        return { error: "Choose CP or IP.", ok: false };
      }
      outcome = { genuine: true, estimateAmount, customerInterested: true, paymentType };
    }
  }

  try {
    await submitCallOutcome(id, admin.branch, admin.username, outcome, remark);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't save the call outcome.", ok: false };
  }
  revalidatePath("/bp-referrals");
  return { error: null, ok: true };
}

export async function transferReferralAction(_prev: BpmActionState, formData: FormData): Promise<BpmActionState> {
  const admin = requireBpManager(await getCurrentAdmin());
  if (!admin) return { error: "Not allowed.", ok: false };

  const id = Number(formData.get("id"));
  const toBranch = String(formData.get("toBranch") ?? "").trim();
  if (!Number.isFinite(id) || id <= 0) return { error: "Bad referral id.", ok: false };
  if (!toBranch) return { error: "Pick a branch to transfer to.", ok: false };
  if (toBranch === admin.branch) return { error: "Already assigned to your branch.", ok: false };

  const validCodes = await listBranchCodes();
  if (!validCodes.includes(toBranch)) return { error: "Unknown branch.", ok: false };

  try {
    await transferReferral(id, admin.branch, toBranch, admin.username);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't transfer that referral.", ok: false };
  }
  revalidatePath("/bp-referrals");
  return { error: null, ok: true };
}

/** The follow-up popup's data source (see bp-followup-popup-gate.tsx) —
 * decides for itself, server-side, whether this viewer has anything
 * overdue, same convention as getMyOpenQueriesForPopupAction. Empty for
 * every role but bp_manager. */
export async function getMyOverdueFollowUpsAction(): Promise<BpReferralRow[]> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== "bp_manager") return [];
  return loadOverdueFollowUps(admin.branch);
}

/** The urgent-contact popup's data source (see
 * bp-urgent-contact-popup-gate.tsx) — referrals never yet connected that
 * are overdue their first/next attempt, same "decide for itself" shape. */
export async function getMyUrgentUnconnectedAction(): Promise<BpReferralRow[]> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== "bp_manager") return [];
  return loadUrgentUnconnected(admin.branch);
}

/** Inline "I just spoke to them again" action from the popup or the queue
 * page — resets the follow-up clock, remark required same as every other
 * action. */
export async function logFollowUpContactAction(_prev: BpmActionState, formData: FormData): Promise<BpmActionState> {
  const admin = requireBpManager(await getCurrentAdmin());
  if (!admin) return { error: "Not allowed.", ok: false };

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id) || id <= 0) return { error: "Bad referral id.", ok: false };
  const remark = requiredRemark(formData);
  if (!remark) return { error: "A remark is required.", ok: false };

  try {
    await logFollowUpContact(id, admin.branch, admin.username, remark);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't update that referral.", ok: false };
  }
  revalidatePath("/bp-referrals");
  return { error: null, ok: true };
}

/** The detail modal's "History" section — every bp_manager/bp_ho/hq viewer
 * can read it (it's just the audit trail of what's already shown on the
 * referral), no branch-ownership check needed beyond being signed in as a
 * BP role at all. */
export async function getReferralActivityAction(referralId: number): Promise<ActivityRow[]> {
  const admin = await getCurrentAdmin();
  if (!admin || (admin.role !== "bp_manager" && admin.role !== "bp_ho" && admin.role !== "hq")) return [];
  if (!Number.isFinite(referralId) || referralId <= 0) return [];
  return loadActivityForReferral(referralId);
}
