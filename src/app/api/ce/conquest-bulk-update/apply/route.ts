import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/auth";
import { indiaDate } from "@/lib/ce/rules";
import { applyConquestBulkRows, validateConquestBulkRows } from "@/lib/ce/conquest-bulk-update";
import { logCeConquestBulkApplyResults } from "@/lib/ce/conquest-store";
import { loadReportHolidaySet } from "@/lib/report-holidays/store";

/** Commit half of Conquest's "download, call offline, reupload" flow
 * (2026-11-13) — mirrors /api/ce/mrs-bulk-update/apply exactly: re-parses
 * and re-validates the same file from scratch (never trusts a client-
 * supplied row list), then runs every error-free, non-empty row through
 * updateConquestLead. */
export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin || (admin.role !== "ce_head" && admin.role !== "ce_agent")) {
    return NextResponse.json({ error: "Only a CE account can upload call results." }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Could not read the uploaded file." }, { status: 400 });
  }

  const holidays = await loadReportHolidaySet();
  const requireAssignedTo = admin.role === "ce_agent" ? admin.username : undefined;

  let rows;
  try {
    rows = await validateConquestBulkRows(buffer, { today: indiaDate(), holidays, requireAssignedTo });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not parse this file." }, { status: 422 });
  }
  if (rows.length === 0) return NextResponse.json({ error: "No rows found in this sheet." }, { status: 422 });

  const results = await applyConquestBulkRows(rows, admin.username, requireAssignedTo);
  // Best-effort — a logging failure shouldn't undo updates that already
  // committed.
  try {
    await logCeConquestBulkApplyResults(results, admin.username, file.name);
  } catch (error) {
    console.error("Could not log Conquest bulk-apply results:", error);
  }

  revalidatePath("/ce/conquest");

  return NextResponse.json({
    results,
    updatedCount: results.filter((r) => r.success).length,
    errorCount: results.filter((r) => !r.success).length,
    skippedCount: rows.filter((r) => r.empty || r.error).length,
  });
}
