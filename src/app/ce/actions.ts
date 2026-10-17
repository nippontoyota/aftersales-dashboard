"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/auth";
import { indiaDate, parseCeDateInput, validateCeCallDetails } from "@/lib/ce/rules";
import { updateCeLead } from "@/lib/ce/store";

export type CeUpdateState = { error: string | null; success: boolean };

export async function updateCeLeadAction(vin: string, _state: CeUpdateState, formData: FormData): Promise<CeUpdateState> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== "ce") return { error: "Only the CE account can update leads.", success: false };
  const callStatus = String(formData.get("callStatus") ?? "");
  const outcome = String(formData.get("outcome") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const followUpRaw = String(formData.get("nextFollowUpDate") ?? "").trim();
  const followUpDate = followUpRaw ? parseCeDateInput(followUpRaw) : null;
  if (followUpRaw && !followUpDate) return { error: "Enter the date as DD/MM/YYYY.", success: false };
  const callError = validateCeCallDetails({ callStatus, outcome, followUpDate, today: indiaDate() });
  if (callError) return { error: callError, success: false };
  if (!note) return { error: "What the customer said is required.", success: false };
  if (note.length > 2_000) return { error: "Keep the customer response to 2,000 characters or fewer.", success: false };
  try {
    await updateCeLead({ vin, callStatus, outcome, nextFollowUpDate: followUpDate, note, username: admin.username });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update this lead.", success: false };
  }
  revalidatePath("/ce");
  revalidatePath(`/ce/leads/${encodeURIComponent(vin)}`);
  return { error: null, success: true };
}
