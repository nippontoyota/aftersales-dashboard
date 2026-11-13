import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { indiaDate } from "@/lib/ce/rules";
import { validateConquestBulkRows } from "@/lib/ce/conquest-bulk-update";
import { loadReportHolidaySet } from "@/lib/report-holidays/store";

/** Dry-run half of Conquest's "download, call offline, reupload" flow
 * (2026-11-13) — mirrors /api/ce/mrs-bulk-update/preview exactly, keyed by
 * Lead ID instead of VIN. */
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
    const rows = await validateConquestBulkRows(buffer, { today: indiaDate(), holidays, requireAssignedTo });
    if (rows.length === 0) return NextResponse.json({ error: "No rows found in this sheet." }, { status: 422 });
    return NextResponse.json({ rows });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not parse this file." }, { status: 422 });
  }
}
