import { NextResponse } from "next/server";
import { listAccessoriesStaffNamesForBranch } from "@/lib/accessories-staff-store";
import { getCurrentAdmin } from "@/lib/auth";
import { loadRawReportUpload, saveRawReportUpload } from "@/lib/raw-report-uploads/store";
import { parseServiceInfoWorkbook } from "@/lib/service-info/parse";
import { saveServiceInfoBpSnapshot } from "@/lib/service-info-bp/store";

/** Service Information Report - BP — required daily like every other
 * upload. The raw file is always kept (see raw-report-uploads/store.ts),
 * same as before 2026-09-11; on top of that it's now also parsed with the
 * exact same rules as the GS report (service-info/parse.ts) for Wheel
 * Balancing / Wheel Alignment / Brake Skimming / VAS Revenue — never
 * Evaporator Cleaning, which stays GS-only (at the user's request). Those
 * four get added onto the branch's GS totals at read time (see
 * loadCombinedServiceInfoSnapshots* in service-info/store.ts), not merged
 * into service_info_snapshots itself.
 *
 * A BP job order rarely carries these job codes, so a parse failure here
 * (an unexpected file shape) doesn't block the upload — the raw file is
 * still saved and locked exactly as before; it just has nothing pulled out
 * of it, same as if this parsing step didn't exist. */
export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (admin.role !== "branch") {
    return NextResponse.json({ error: "Only a branch account can upload a Service Info Report." }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const date = String(formData.get("date") ?? "").trim();

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Choose a valid date for this upload." }, { status: 400 });
  }

  if (await loadRawReportUpload(date, admin.branch, "service_info_bp")) {
    return NextResponse.json(
      { error: `Already uploaded for ${date} — contact HQ (Upload Sheet) if this needs correcting.` },
      { status: 409 }
    );
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Could not read the uploaded file." }, { status: 400 });
  }

  const uploadedAt = new Date().toISOString();
  await saveRawReportUpload({
    date,
    branch: admin.branch,
    reportType: "service_info_bp",
    uploadedAt,
    sourceFileName: file.name,
    fileData: buffer,
  });

  let bpCounts = null;
  try {
    const staffNames = await listAccessoriesStaffNamesForBranch(admin.branch);
    const { counts } = parseServiceInfoWorkbook(buffer, admin.branch, staffNames);
    await saveServiceInfoBpSnapshot({ date, branch: admin.branch, uploadedAt, sourceFileName: file.name, counts });
    bpCounts = counts;
  } catch {
    // Not a Service Info-shaped export (or some other unexpected shape) —
    // the raw file above is still saved and locked either way; there's
    // just nothing to add to Wheel Balancing/Alignment/Brake Skimming/VAS.
  }

  return NextResponse.json({ success: true, date, branch: admin.branch, sourceFileName: file.name, bpCounts });
}
