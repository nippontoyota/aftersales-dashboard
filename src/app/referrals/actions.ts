"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/auth";
import {
  enterRoNumber,
  loadCallHistory,
  markAlreadyVisited,
  markNotConnected,
  setAppointmentDate,
  submitCallOutcome,
  type CallOutcome,
  type InactiveReferralCallRow,
} from "@/lib/inactive-referrals/store";

export type ReferralActionState = { error: string | null; ok: boolean };

function requireBranchAdmin(admin: Awaited<ReturnType<typeof getCurrentAdmin>>) {
  if (!admin || admin.role !== "branch") return null;
  return admin;
}

function requiredField(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value ? value : null;
}

export async function markNotConnectedAction(_prev: ReferralActionState, formData: FormData): Promise<ReferralActionState> {
  const admin = requireBranchAdmin(await getCurrentAdmin());
  if (!admin) return { error: "Not allowed.", ok: false };

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id) || id <= 0) return { error: "Bad referral id.", ok: false };
  const reason = requiredField(formData, "reason");
  if (!reason) return { error: "Pick a reason.", ok: false };
  const remarkRaw = requiredField(formData, "remark");
  if (reason === "other" && !remarkRaw) return { error: "A remark is required.", ok: false };
  const remark = remarkRaw ?? "No additional remark.";

  try {
    await markNotConnected(id, admin.branch, admin.username, remark, reason);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't update that referral.", ok: false };
  }
  revalidatePath("/referrals");
  return { error: null, ok: true };
}

export async function submitCallOutcomeAction(_prev: ReferralActionState, formData: FormData): Promise<ReferralActionState> {
  const admin = requireBranchAdmin(await getCurrentAdmin());
  if (!admin) return { error: "Not allowed.", ok: false };

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id) || id <= 0) return { error: "Bad referral id.", ok: false };

  const genuine = String(formData.get("genuine") ?? "");
  if (genuine !== "yes" && genuine !== "no") return { error: "Say whether this is genuine.", ok: false };

  let outcome: CallOutcome;
  if (genuine === "no") {
    const reason = requiredField(formData, "notGenuineReason");
    if (!reason) return { error: "Say why this isn't a genuine inactive customer.", ok: false };
    outcome = { genuine: false, reason };
  } else {
    const interested = String(formData.get("customerInterested") ?? "");
    if (interested !== "yes" && interested !== "no") return { error: "Say whether the customer is interested.", ok: false };
    if (interested === "no") {
      const reason = requiredField(formData, "notInterestedReason");
      if (!reason) return { error: "Say why the customer isn't interested.", ok: false };
      outcome = { genuine: true, customerInterested: false, reason };
    } else {
      const appointmentDate = requiredField(formData, "appointmentDate");
      if (appointmentDate && !/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)) return { error: "Pick a valid appointment date.", ok: false };
      const remark = requiredField(formData, "remark");
      outcome = { genuine: true, customerInterested: true, appointmentDate: appointmentDate ?? undefined, remark: remark ?? undefined };
    }
  }

  try {
    await submitCallOutcome(id, admin.branch, admin.username, outcome);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't save the call outcome.", ok: false };
  }
  revalidatePath("/referrals");
  return { error: null, ok: true };
}

export async function setAppointmentDateAction(_prev: ReferralActionState, formData: FormData): Promise<ReferralActionState> {
  const admin = requireBranchAdmin(await getCurrentAdmin());
  if (!admin) return { error: "Not allowed.", ok: false };

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id) || id <= 0) return { error: "Bad referral id.", ok: false };
  const appointmentDate = requiredField(formData, "appointmentDate");
  if (!appointmentDate || !/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)) return { error: "Pick a valid date.", ok: false };
  const remark = requiredField(formData, "remark");
  if (!remark) return { error: "A remark is required.", ok: false };

  try {
    await setAppointmentDate(id, admin.branch, admin.username, appointmentDate, remark);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't save the appointment date.", ok: false };
  }
  revalidatePath("/referrals");
  return { error: null, ok: true };
}

export type EnterRoActionState = { error: string | null; status: "completed" | "pending" | null };

export async function enterRoNumberAction(_prev: EnterRoActionState, formData: FormData): Promise<EnterRoActionState> {
  const admin = requireBranchAdmin(await getCurrentAdmin());
  if (!admin) return { error: "Not allowed.", status: null };

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id) || id <= 0) return { error: "Bad referral id.", status: null };
  const roNo = requiredField(formData, "roNo");
  if (!roNo) return { error: "Enter the RO number.", status: null };

  try {
    const status = await enterRoNumber(id, admin.branch, admin.username, roNo);
    revalidatePath("/referrals");
    return { error: null, status };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't save the RO number.", status: null };
  }
}

export async function markAlreadyVisitedAction(_prev: ReferralActionState, formData: FormData): Promise<ReferralActionState> {
  const admin = requireBranchAdmin(await getCurrentAdmin());
  if (!admin) return { error: "Not allowed.", ok: false };

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id) || id <= 0) return { error: "Bad referral id.", ok: false };

  try {
    await markAlreadyVisited(id, admin.branch, admin.username);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't update that referral.", ok: false };
  }
  revalidatePath("/referrals");
  return { error: null, ok: true };
}

/** The detail view's call-history list — any viewer who can reach the page
 * (branch acting on its own queue, HQ reading the company-wide overview). */
export async function getCallHistoryAction(referralId: number): Promise<InactiveReferralCallRow[]> {
  const admin = await getCurrentAdmin();
  if (!admin || (admin.role !== "branch" && admin.role !== "hq")) return [];
  if (!Number.isFinite(referralId) || referralId <= 0) return [];
  return loadCallHistory(referralId);
}
