import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { hashBuffer } from "@/lib/duplicate-detection";
import { loadAllRawReportUploadsBefore, loadRawReportUpload, saveRawReportUpload } from "@/lib/raw-report-uploads/store";
import { detectReportType, type DetectedReportType } from "@/lib/report-sniffer";
import { parseSsrv089BpGreyTotals } from "@/lib/ssrv089-bp/parse";
import { saveSsrv089BpGreySnapshot } from "@/lib/ssrv089-bp/store";

const WRONG_TYPE_LABELS: Record<Exclude<DetectedReportType, "ssrv089">, string> = {
  "service-info": "Service Info Report",
  "part-sale": "Part Sale Report",
  scom205: "scom205 Monthly KPI Report",
};

/** Cost and Sales Report - BP — required daily like every other upload.
 * Its columns stay deliberately unparsed beyond the Brand(Toyota/Grey)
 * check below (2026-09-01, at the user's request — see
 * raw-report-uploads/store.ts). Not the same thing as the old SSRV089
 * "Body & Paint" variant dropped 2026-08-31 — this is a fresh upload, not a
 * revival of that parsing path.
 *
 * Structural validation (2026-10-01, at the user's request): before this,
 * nothing ever opened the file to check it was actually a Cost and Sales
 * Report - BP export — a handful of branches had silently gotten away with
 * uploading the wrong report type, a `.zip`, or an otherwise unreadable
 * file for months with no error at all (only noticed once Grey-brand
 * revenue tracking needed to read these files for real). A file that
 * doesn't parse is now rejected outright rather than silently accepted. */
export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (admin.role !== "branch") {
    return NextResponse.json({ error: "Only a branch account can upload a Cost and Sales Report." }, { status: 403 });
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

  if (await loadRawReportUpload(date, admin.branch, "ssrv089_bp")) {
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

  // Structural check — rejects outright rather than silently accepting (see
  // this route's doc comment above). Two steps: first rule out a different
  // known report type entirely, using the same signatures report-sniffer.ts
  // uses for Upload Sheet's auto-detect; then confirm this file at least has
  // the Cost & Sales shape (2026-10-02: loosened to not require
  // Brand(Toyota/Grey) specifically — some branches' DMS genuinely never
  // includes it, see ssrv089-bp/parse.ts). Validated before the duplicate
  // checks below so a bad file is never compared against prior uploads or
  // saved at all.
  let detectedType: DetectedReportType | null = null;
  try {
    detectedType = detectReportType(buffer);
  } catch {
    // Unreadable as a spreadsheet at all — the Cost & Sales check below
    // produces the real error.
  }
  if (detectedType && detectedType !== "ssrv089") {
    return NextResponse.json(
      { error: `This looks like a ${WRONG_TYPE_LABELS[detectedType]}, not a Cost and Sales Report - BP export.` },
      { status: 422 }
    );
  }

  let parsed;
  try {
    parsed = parseSsrv089BpGreyTotals(buffer);
  } catch (err) {
    return NextResponse.json(
      {
        error: `Could not read this file: ${err instanceof Error ? err.message : "unknown error"}. Is this a Cost and Sales Report - BP export?`,
      },
      { status: 422 }
    );
  }

  // Warn-and-allow duplicate check (2026-09-16, at the user's request) — see
  // service-info-bp's upload route for the full rationale (this report type
  // also keeps no parsed rows, so file bytes are compared directly, against
  // every prior upload this month rather than just the most recent one).
  const confirmed = formData.get("confirmDuplicate") === "true";
  if (!confirmed) {
    const priorUploads = await loadAllRawReportUploadsBefore(admin.branch, "ssrv089_bp", date);
    const newHash = hashBuffer(buffer);
    const match = priorUploads.find((u) => hashBuffer(u.fileData) === newHash);
    if (match) {
      return NextResponse.json({
        duplicate: true,
        previousDate: match.date,
        previousFileName: match.sourceFileName,
        message: `This file looks identical to your upload from ${match.date} (${match.sourceFileName}). Are you sure this is ${date}'s file?`,
      });
    }
  }

  const uploadedAt = new Date().toISOString();
  await saveRawReportUpload({
    date,
    branch: admin.branch,
    reportType: "ssrv089_bp",
    uploadedAt,
    sourceFileName: file.name,
    fileData: buffer,
    uploadedBy: admin.username,
  });

  // parsed was already extracted and validated above.
  await saveSsrv089BpGreySnapshot({ date, branch: admin.branch, uploadedAt, sourceFileName: file.name, totals: parsed.totals });

  return NextResponse.json({
    success: true,
    date,
    branch: admin.branch,
    sourceFileName: file.name,
    // Header matched but there were zero data rows underneath it — accepted
    // (see ssrv089-bp/parse.ts), but worth the uploader double-checking this
    // wasn't a broken DMS export rather than a genuinely quiet day.
    warning: parsed.isEmpty
      ? "This file has the right structure but contains no data rows. If the branch had Cost and Sales - BP business today, check the export — this might be a partial or broken pull from the DMS."
      : undefined,
  });
}
