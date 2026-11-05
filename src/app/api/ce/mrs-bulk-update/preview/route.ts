import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { indiaDate } from "@/lib/ce/rules";
import { validateMrsBulkRows } from "@/lib/ce/mrs-bulk-update";
import { loadReportHolidaySet } from "@/lib/report-holidays/store";

/** Dry-run half of the "download, call offline, reupload" flow
 * (2026-11-05) — parses and validates the reuploaded sheet exactly like
 * /apply does, but never writes anything, so the CAC team can see what
 * would happen (including the "looks already done today" warning) before
 * committing to it. */
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

  try {
    const rows = await validateMrsBulkRows(buffer, { today: indiaDate(), holidays, requireAssignedTo });
    if (rows.length === 0) return NextResponse.json({ error: "No rows found in this sheet." }, { status: 422 });
    return NextResponse.json({ rows });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not parse this file." }, { status: 422 });
  }
}
