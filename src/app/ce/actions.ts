"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/auth";
import { listCeAgents } from "@/lib/admin-store";
import { indiaDate, isValidIsoDate, validateCeCallDetails } from "@/lib/ce/rules";
import { assignCeLeadsEvenly, markCeMrsFollowUpAlreadyScheduled, updateCeLead } from "@/lib/ce/store";

export type CeUpdateState = { error: string | null; success: boolean };

export async function updateCeLeadAction(vin: string, _state: CeUpdateState, formData: FormData): Promise<CeUpdateState> {
  const admin = await getCurrentAdmin();
  if (!admin || (admin.role !== "ce_head" && admin.role !== "ce_agent")) return { error: "Only a CE account can update leads.", success: false };
  const callStatus = String(formData.get("callStatus") ?? "");
  const outcome = String(formData.get("outcome") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const followUpRaw = String(formData.get("nextFollowUpDate") ?? "").trim();
  const followUpDate = followUpRaw && isValidIsoDate(followUpRaw) ? followUpRaw : null;
  if (followUpRaw && !followUpDate) return { error: "Choose a valid appointment or follow-up date.", success: false };
  const callError = validateCeCallDetails({ callStatus, outcome, followUpDate, today: indiaDate() });
  if (callError) return { error: callError, success: false };
  if (!note) return { error: "What the customer said is required.", success: false };
  if (note.length > 2_000) return { error: "Keep the customer response to 2,000 characters or fewer.", success: false };
  try {
    await updateCeLead({
      vin, callStatus, outcome, nextFollowUpDate: followUpDate, note, username: admin.username,
      requireAssignedTo: admin.role === "ce_agent" ? admin.username : undefined,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update this lead.", success: false };
  }
  revalidatePath("/ce");
  revalidatePath(`/ce/leads/${encodeURIComponent(vin)}`);
  return { error: null, success: true };
}

/** The "not even going to try them" shortcut (2026-11-03) — a common
 * button alongside the normal call-log form for a lead whose MRS
 * follow-up is already scheduled some other way, so no call is being
 * attempted at all: one click, no input, skips callStatus/outcome/date
 * entirely and never touches the attempt counter. */
export async function markCeMrsFollowUpAlreadyScheduledAction(vin: string): Promise<CeUpdateState> {
  const admin = await getCurrentAdmin();
  if (!admin || (admin.role !== "ce_head" && admin.role !== "ce_agent")) return { error: "Only a CE account can update leads.", success: false };
  try {
    await markCeMrsFollowUpAlreadyScheduled({
      vin, username: admin.username,
      requireAssignedTo: admin.role === "ce_agent" ? admin.username : undefined,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update this lead.", success: false };
  }
  revalidatePath("/ce");
  revalidatePath(`/ce/leads/${encodeURIComponent(vin)}`);
  return { error: null, success: true };
}

/** The CE head's "Assign evenly" bulk action on /ce/mrs — a plain <form
 * action> posting checked VINs (no client JS needed for the selection
 * itself). Round-robins across every ce_agent reporting to this head; see
 * assignCeLeadsEvenly's own doc comment for the exact rule. */
export async function assignCeLeadsEvenlyAction(formData: FormData) {
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== "ce_head") redirect("/ce/mrs");
  const vins = formData.getAll("vin").map(String).filter(Boolean);
  const returnTo = String(formData.get("returnTo") ?? "/ce/mrs");

  if (vins.length === 0) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}assignError=${encodeURIComponent("Select at least one lead first.")}`);

  const agents = await listCeAgents(admin.username);
  if (agents.length === 0) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}assignError=${encodeURIComponent("No CE agents report to you yet.")}`);

  const { assignedCount } = await assignCeLeadsEvenly({ vins, agents });
  revalidatePath("/ce/mrs");
  revalidatePath("/ce");
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}assigned=${assignedCount}`);
}
