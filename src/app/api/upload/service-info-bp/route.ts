import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { loadRawReportUpload, saveRawReportUpload } from "@/lib/raw-report-uploads/store";

/** Service Information Report - BP — required daily like every other
 * upload, but nothing is parsed out of it (2026-09-01, at the user's
 * request). See raw-report-uploads/store.ts. */
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

  await saveRawReportUpload({
    date,
    branch: admin.branch,
    reportType: "service_info_bp",
    uploadedAt: new Date().toISOString(),
    sourceFileName: file.name,
    fileData: buffer,
  });

  return NextResponse.json({ success: true, date, branch: admin.branch, sourceFileName: file.name });
}
