"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/auth";
import { listBranchCodes } from "@/lib/admin-store";
import {
  changePaymentType,
  closeFollowUpAsLost,
  enterRoNumber,
  fillMissingReferralDetails,
  loadActivityForReferral,
  loadOverdueFollowUps,
  loadReferralPaymentType,
  loadUrgentUnconnected,
  logFollowUpContact,
  markNotConnected,
  submitCallOutcome,
  transferReferral,
  type ActivityRow,
  type BpReferralRow,
  type CallOutcome,
} from "@/lib/bp-referrals/store";
import { NOT_CONNECTED_REASONS, notConnectedReasonLabel } from "@/lib/bp-referrals/not-connected-reasons";
import { FOLLOW_UP_STAGES } from "@/lib/bp-referrals/followup-stages";

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

  const reason = String(formData.get("reason") ?? "");
  if (!NOT_CONNECTED_REASONS.some((r) => r.value === reason)) return { error: "Choose a reason.", ok: false };

  let remark: string;
  if (reason === "other") {
    const customRemark = requiredRemark(formData);
    if (!customRemark) return { error: "A reason is required.", ok: false };
    remark = customRemark;
  } else {
    remark = notConnectedReasonLabel(reason)!;
  }

  try {
    await markNotConnected(id, admin.branch, admin.username, reason, remark);
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
      const notInterestedReason = String(formData.get("notInterestedReason") ?? "").trim();
      if (!notInterestedReason) return { error: "Enter the reason the customer isn't interested.", ok: false };
      outcome = { genuine: true, estimateAmount, customerInterested: false, notInterestedReason };
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

/** Inline "I just spoke to them again" / progress-note action from the
 * popup or the queue page — resets the follow-up clock, remark required
 * same as every other action. `stage` is optional (the login popup's quick
 * form omits it, see bp-followup-popup-gate.tsx); when the full follow-up
 * form sends "vehicle_received" for an insurance-paid (IP) referral, the
 * BPE estimate invoice number is additionally required — re-checked here
 * against the referral's own payment_type, never trusting what the client
 * claims it is (2026-11-06, the user's pipeline: this is what moves a
 * referral into "Vehicle received"). A customer-paid (CP) referral can
 * still log "vehicle_received" as a plain note; it just doesn't ask for or
 * accept a BPE number, since CP has no estimate-invoice paperwork step. */
export async function logFollowUpContactAction(_prev: BpmActionState, formData: FormData): Promise<BpmActionState> {
  const admin = requireBpManager(await getCurrentAdmin());
  if (!admin) return { error: "Not allowed.", ok: false };

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id) || id <= 0) return { error: "Bad referral id.", ok: false };
  const remark = requiredRemark(formData);
  if (!remark) return { error: "A remark is required.", ok: false };

  const stageRaw = String(formData.get("followUpStage") ?? "").trim();
  const stage = stageRaw || undefined;
  if (stage && !FOLLOW_UP_STAGES.some((s) => s.value === stage)) return { error: "Choose a valid stage.", ok: false };

  let estimateInvoiceNo: string | undefined;
  if (stage === "vehicle_received") {
    const paymentType = await loadReferralPaymentType(id);
    if (paymentType === "IP") {
      const digits = String(formData.get("estimateInvoiceDigits") ?? "").trim();
      if (!digits) return { error: "Enter the BP Estimate Invoice number.", ok: false };
      estimateInvoiceNo = `BPE${digits}`;
    }
  }

  try {
    await logFollowUpContact(id, admin.branch, admin.username, remark, stage, estimateInvoiceNo);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't update that referral.", ok: false };
  }
  revalidatePath("/bp-referrals");
  return { error: null, ok: true };
}

/** BPM fills in a vehicle reg no / customer phone / vehicle model the
 * referring employee left blank (2026-11-12, at the user's request) — see
 * fillMissingReferralDetails in store.ts for the fill-only rules. Every
 * field here is optional on the wire; the UI only ever sends the ones it
 * showed an input for (i.e. the ones that were actually blank), and
 * store.ts re-enforces fill-only regardless of what's sent. */
export async function fillReferralDetailsAction(_prev: BpmActionState, formData: FormData): Promise<BpmActionState> {
  const admin = requireBpManager(await getCurrentAdmin());
  if (!admin) return { error: "Not allowed.", ok: false };

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id) || id <= 0) return { error: "Bad referral id.", ok: false };

  const vehicleRegNo = String(formData.get("vehicleRegNo") ?? "").trim();
  const customerPhone = String(formData.get("customerPhone") ?? "").trim();
  const vehicleModel = String(formData.get("vehicleModel") ?? "").trim();
  if (!vehicleRegNo && !customerPhone && !vehicleModel) return { error: "Enter at least one detail.", ok: false };

  try {
    await fillMissingReferralDetails(id, admin.branch, admin.username, {
      vehicleRegNo: vehicleRegNo || undefined,
      customerPhone: customerPhone || undefined,
      vehicleModel: vehicleModel || undefined,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't save those details.", ok: false };
  }
  revalidatePath("/bp-referrals");
  return { error: null, ok: true };
}

/** BPM corrects an already-chosen payment type (2026-11-11, at the user's
 * request) — see changePaymentType in store.ts for the full rules; this is
 * just the form-data plumbing, same shape as every other action here. The
 * BPE digits are optional on the wire (the UI only shows that field when it
 * thinks it's needed) — store.ts re-derives whether it's actually required
 * and throws if it's missing. */
export async function changePaymentTypeAction(_prev: BpmActionState, formData: FormData): Promise<BpmActionState> {
  const admin = requireBpManager(await getCurrentAdmin());
  if (!admin) return { error: "Not allowed.", ok: false };

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id) || id <= 0) return { error: "Bad referral id.", ok: false };
  const newPaymentType = String(formData.get("paymentType") ?? "").trim();
  if (newPaymentType !== "CP" && newPaymentType !== "IP") return { error: "Choose a payment type.", ok: false };
  const remark = requiredRemark(formData);
  if (!remark) return { error: "A remark is required.", ok: false };

  const digits = String(formData.get("estimateInvoiceDigits") ?? "").trim();
  const estimateInvoiceNo = digits ? `BPE${digits}` : undefined;

  try {
    await changePaymentType(id, admin.branch, admin.username, newPaymentType, remark, estimateInvoiceNo);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't change the payment type.", ok: false };
  }
  revalidatePath("/bp-referrals");
  return { error: null, ok: true };
}

/** Closes out a validated (genuine + interested) referral as "Lost" — the
 * BPM's call that the customer took the car elsewhere and there's no point
 * following up any further (2026-10-27, the user's request). Mandatory
 * reason, same shape as every other action here. */
export async function closeFollowUpAsLostAction(_prev: BpmActionState, formData: FormData): Promise<BpmActionState> {
  const admin = requireBpManager(await getCurrentAdmin());
  if (!admin) return { error: "Not allowed.", ok: false };

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id) || id <= 0) return { error: "Bad referral id.", ok: false };
  const lostReason = requiredRemark(formData);
  if (!lostReason) return { error: "Enter the reason this is lost.", ok: false };

  try {
    await closeFollowUpAsLost(id, admin.branch, admin.username, lostReason);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't close that referral.", ok: false };
  }
  revalidatePath("/bp-referrals");
  return { error: null, ok: true };
}

export type EnterRoActionState = { error: string | null; status: "completed" | "pending" | null };

/** BPM types in the actual RO number against their own queue entry — the
 * ₹200 completion trigger (2026-10-26, replacing the old blind vehicle-reg-
 * no auto-match). See store.ts's enterRoNumber() for the validation rules. */
export async function enterRoNumberAction(_prev: EnterRoActionState, formData: FormData): Promise<EnterRoActionState> {
  const admin = requireBpManager(await getCurrentAdmin());
  if (!admin) return { error: "Not allowed.", status: null };

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id) || id <= 0) return { error: "Bad referral id.", status: null };

  const roNo = String(formData.get("roNo") ?? "").trim();
  if (!roNo) return { error: "Enter the RO number.", status: null };

  try {
    const status = await enterRoNumber(id, admin.branch, admin.username, roNo);
    revalidatePath("/bp-referrals");
    return { error: null, status };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't save that RO number.", status: null };
  }
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
