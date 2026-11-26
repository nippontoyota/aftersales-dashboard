"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/auth";
import {
  getCancellationBranch,
  justificationStatus,
  loadJustifications,
  submitBranchJustification,
  submitRegionalJustification,
  type BranchResolution,
  type RegionalDecision,
} from "@/lib/cancellation/justifications";
import { lookupRoInvoice } from "@/lib/cancellation/ro-lookup";
import { recomputeCrossMonthReplacements } from "@/lib/cancellation/cross-month-replacement";
import { pool } from "@/lib/db";
import { REGIONS } from "@/lib/regions";

export type JustificationActionState = { error: string | null; ok: boolean; warning?: string | null };
const INIT: JustificationActionState = { error: null, ok: false };

/** The branch's own justification for a flagged cancellation of theirs —
 * callable again to edit it (including resubmitting after a regional
 * reject), but only before the regional manager has approved it (once
 * approved, it's locked — matches the "branch first, regional reviews"
 * workflow with no further edits after sign-off). */
export async function submitBranchJustificationAction(_prev: JustificationActionState, formData: FormData): Promise<JustificationActionState> {
  const admin = await getCurrentAdmin();
  if (admin?.role !== "branch") return { ...INIT, error: "Not allowed." };

  const docNo = String(formData.get("docNo") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const resolution = String(formData.get("resolution") ?? "") as BranchResolution;
  const newRo = String(formData.get("newRo") ?? "").trim();
  if (!docNo) return { ...INIT, error: "Missing cancellation." };
  if (!note) return { ...INIT, error: "Add a remark first." };
  if (resolution !== "ro_cancelled" && resolution !== "still_not_closed") return { ...INIT, error: "Choose a reason first." };
  if (resolution === "ro_cancelled" && !newRo) return { ...INIT, error: "Enter the new RO number this was rebilled under." };

  const actualBranch = await getCancellationBranch(docNo);
  if (actualBranch !== admin.branch) return { ...INIT, error: "Not your branch's cancellation." };

  const existing = (await loadJustifications([docNo])).get(docNo);
  const status = justificationStatus(existing);
  if (status === "resolved") return { ...INIT, error: "Already approved by your regional manager — can't edit." };

  // Cancelled invoice's own revenue date — a rebill can't land earlier than
  // that, so bounding the lookup there keeps it cheap (see ro-lookup.ts).
  const { rows: cancRows } = await pool.query<{ earliest: string }>(
    `select coalesce(issue_date, cancel_date)::text as earliest from invoice_cancellations where doc_no = $1`,
    [docNo]
  );
  const fromDate = cancRows[0]?.earliest ?? "2020-01-01";

  let warning: string | null = null;
  if (resolution === "ro_cancelled") {
    const match = await lookupRoInvoice(admin.branch, newRo, fromDate);
    if (!match) {
      warning =
        "That RO isn't in Cost & Sales data yet for this branch — saved anyway. It'll be picked up automatically once it's uploaded, so double-check the number if it doesn't resolve soon.";
    }
  }

  await submitBranchJustification(docNo, admin.branch, admin.username, note, resolution, resolution === "ro_cancelled" ? newRo : null);
  revalidatePath("/cancellations");
  return { error: null, ok: true, warning };
}

/** The regional manager's approve/reject on top of the branch's own
 * justification — rejected if the branch hasn't submitted theirs yet (the
 * required order), or if the cancellation isn't in this admin's region.
 * Approving an 'ro_cancelled' justification is what makes the branch's
 * entered RO actually count as a rebill in reconcile.ts/
 * cross-month-replacement.ts, so it also triggers the same recompute an
 * SSRV089 upload would (see adjustment-recompute.ts). */
export async function submitRegionalJustificationAction(_prev: JustificationActionState, formData: FormData): Promise<JustificationActionState> {
  const admin = await getCurrentAdmin();
  if (admin?.role !== "regional") return { ...INIT, error: "Not allowed." };

  const docNo = String(formData.get("docNo") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const decision = String(formData.get("decision") ?? "") as RegionalDecision;
  if (!docNo) return { ...INIT, error: "Missing cancellation." };
  if (!note) return { ...INIT, error: "Add your own note first." };
  if (decision !== "approved" && decision !== "rejected") return { ...INIT, error: "Choose approve or reject." };

  const actualBranch = await getCancellationBranch(docNo);
  if (!actualBranch || !(REGIONS[admin.region] as readonly string[]).includes(actualBranch)) {
    return { ...INIT, error: "Not a branch in your region." };
  }

  const existing = (await loadJustifications([docNo])).get(docNo);
  const status = justificationStatus(existing);
  if (status === "none") return { ...INIT, error: "The branch hasn't given their reason yet — ask them first." };
  if (status === "resolved") return { ...INIT, error: "Already approved." };

  await submitRegionalJustification(docNo, actualBranch, admin.username, note, decision);

  if (decision === "approved" && existing?.branchResolution === "ro_cancelled") {
    await recomputeCrossMonthReplacements([actualBranch]);
  }

  revalidatePath("/cancellations");
  return { error: null, ok: true };
}
