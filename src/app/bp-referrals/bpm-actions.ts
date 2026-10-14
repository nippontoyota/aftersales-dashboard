"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/auth";
import { listBranchCodes } from "@/lib/admin-store";
import {
  loadOverdueFollowUps,
  logFollowUpContact,
  markNotConnected,
  submitCallOutcome,
  transferReferral,
  type BpReferralRow,
  type CallOutcome,
} from "@/lib/bp-referrals/store";

export type BpmActionState = { error: string | null; ok: boolean };

function requireBpManager(admin: Awaited<ReturnType<typeof getCurrentAdmin>>) {
  if (!admin || admin.role !== "bp_manager") return null;
  return admin;
}

export async function markNotConnectedAction(_prev: BpmActionState, formData: FormData): Promise<BpmActionState> {
  const admin = requireBpManager(await getCurrentAdmin());
  if (!admin) return { error: "Not allowed.", ok: false };

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id) || id <= 0) return { error: "Bad referral id.", ok: false };

  try {
    await markNotConnected(id, admin.branch);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't update that referral.", ok: false };
  }
  revalidatePath("/bp-referrals");
  return { error: null, ok: true };
}

/** The one-form call outcome — genuine, estimate, interested, CP/IP all
 * submitted together once the BPM actually connects with the customer. */
export async function submitCallOutcomeAction(_prev: BpmActionState, formData: FormData): Promise<BpmActionState> {
  const admin = requireBpManager(await getCurrentAdmin());
  if (!admin) return { error: "Not allowed.", ok: false };

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id) || id <= 0) return { error: "Bad referral id.", ok: false };

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
    await submitCallOutcome(id, admin.branch, admin.username, outcome);
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

/** Inline "I just spoke to them again" action from the popup — resets the
 * 3-day clock without opening the full queue page. */
export async function logFollowUpContactAction(_prev: BpmActionState, formData: FormData): Promise<BpmActionState> {
  const admin = requireBpManager(await getCurrentAdmin());
  if (!admin) return { error: "Not allowed.", ok: false };

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id) || id <= 0) return { error: "Bad referral id.", ok: false };

  try {
    await logFollowUpContact(id, admin.branch);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't update that referral.", ok: false };
  }
  revalidatePath("/bp-referrals");
  return { error: null, ok: true };
}
