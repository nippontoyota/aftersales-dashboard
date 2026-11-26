"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/auth";
import { listCeAgents } from "@/lib/admin-store";
import { indiaDate, isValidIsoDate, validateCeCallDetails } from "@/lib/ce/rules";
import { assignConquestLeadsEvenly, updateConquestLead } from "@/lib/ce/conquest-store";

export type CeConquestUpdateState = { error: string | null; success: boolean };

export async function updateConquestLeadAction(id: string, _state: CeConquestUpdateState, formData: FormData): Promise<CeConquestUpdateState> {
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
    await updateConquestLead({
      id, callStatus, outcome, nextFollowUpDate: followUpDate, note, username: admin.username,
      requireAssignedTo: admin.role === "ce_agent" ? admin.username : undefined,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update this lead.", success: false };
  }
  revalidatePath("/ce/conquest");
  revalidatePath(`/ce/conquest/${encodeURIComponent(id)}`);
  return { error: null, success: true };
}

/** Mirrors assignCeLeadsEvenlyAction for the conquest call list. */
export async function assignConquestLeadsEvenlyAction(formData: FormData) {
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== "ce_head") redirect("/ce/conquest");
  const ids = formData.getAll("id").map(String).filter(Boolean);
  const returnTo = String(formData.get("returnTo") ?? "/ce/conquest");

  if (ids.length === 0) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}assignError=${encodeURIComponent("Select at least one lead first.")}`);

  const agents = await listCeAgents(admin.username);
  if (agents.length === 0) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}assignError=${encodeURIComponent("No CE agents report to you yet.")}`);

  const { assignedCount } = await assignConquestLeadsEvenly({ ids, agents });
  revalidatePath("/ce/conquest");
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}assigned=${assignedCount}`);
}
