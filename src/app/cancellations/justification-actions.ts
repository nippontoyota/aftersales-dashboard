"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/auth";
import {
  getCancellationBranch,
  justificationStatus,
  loadJustifications,
  submitBranchJustification,
  submitRegionalJustification,
} from "@/lib/cancellation/justifications";
import { REGIONS } from "@/lib/regions";

export type JustificationActionState = { error: string | null; ok: boolean };
const INIT: JustificationActionState = { error: null, ok: false };

/** The branch's own justification for a flagged cancellation of theirs —
 * callable again to edit it, but only before the regional manager co-signs
 * (once resolved, it's locked — matches the "branch first, regional
 * co-signs" workflow with no further edits after sign-off). */
export async function submitBranchJustificationAction(_prev: JustificationActionState, formData: FormData): Promise<JustificationActionState> {
  const admin = await getCurrentAdmin();
  if (admin?.role !== "branch") return { ...INIT, error: "Not allowed." };

  const docNo = String(formData.get("docNo") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!docNo) return { ...INIT, error: "Missing cancellation." };
  if (!note) return { ...INIT, error: "Explain why this is still unresolved first." };

  const actualBranch = await getCancellationBranch(docNo);
  if (actualBranch !== admin.branch) return { ...INIT, error: "Not your branch's cancellation." };

  const existing = (await loadJustifications([docNo])).get(docNo);
  if (justificationStatus(existing) === "resolved") return { ...INIT, error: "Already co-signed by your regional manager — can't edit." };

  await submitBranchJustification(docNo, admin.branch, admin.username, note);
  revalidatePath("/cancellations");
  return { error: null, ok: true };
}

/** The regional manager's co-sign on top of the branch's own justification
 * — rejected if the branch hasn't submitted theirs yet (the required
 * order), or if the cancellation isn't in this admin's region. */
export async function submitRegionalJustificationAction(_prev: JustificationActionState, formData: FormData): Promise<JustificationActionState> {
  const admin = await getCurrentAdmin();
  if (admin?.role !== "regional") return { ...INIT, error: "Not allowed." };

  const docNo = String(formData.get("docNo") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!docNo) return { ...INIT, error: "Missing cancellation." };
  if (!note) return { ...INIT, error: "Add your own note first." };

  const actualBranch = await getCancellationBranch(docNo);
  if (!actualBranch || !(REGIONS[admin.region] as readonly string[]).includes(actualBranch)) {
    return { ...INIT, error: "Not a branch in your region." };
  }

  const existing = (await loadJustifications([docNo])).get(docNo);
  if (justificationStatus(existing) === "none") return { ...INIT, error: "The branch hasn't given their reason yet — ask them first." };
  if (justificationStatus(existing) === "resolved") return { ...INIT, error: "Already co-signed." };

  await submitRegionalJustification(docNo, actualBranch, admin.username, note);
  revalidatePath("/cancellations");
  return { error: null, ok: true };
}
