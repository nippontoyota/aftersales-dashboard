import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { totalsMatch } from "@/lib/duplicate-detection";
import { saveRawUploadRows } from "@/lib/raw-upload-rows/store";
import { parseScom205Workbook } from "@/lib/scom205/parse";
import { loadMostRecentScom205SnapshotBefore, loadScom205Snapshot, saveScom205Snapshot } from "@/lib/scom205/store";

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (admin.role !== "branch") {
    return NextResponse.json({ error: "Only a branch account can upload a scom205 report." }, { status: 403 });
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

  // A branch can only ever upload each report once per date (2026-08-31, at
  // the user's request — prevents accidental re-uploads and makes "has this
  // been done today" visible at a glance). HQ's own uploads (BA Tool, and
  // /upload-sheet on a branch's behalf) are never subject to this.
  if (await loadScom205Snapshot(date, admin.branch)) {
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

  let totals, rawRows;
  try {
    ({ totals, rawRows } = parseScom205Workbook(buffer));
  } catch (err) {
    return NextResponse.json(
      { error: `Could not parse this file: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 422 }
    );
  }

  // Warn-and-allow duplicate check (2026-09-16, at the user's request) —
  // TI01C repeatedly resent an earlier day's KPI file under a new date this
  // month, silently freezing GUS/BPU Parts & Labour MTD. scom205's four
  // totals are cumulative-MTD, so an exact match against the branch's most
  // recent prior upload is a strong "this is yesterday's file again"
  // signal. Skipped once the admin confirms via confirmDuplicate — they
  // still have to resubmit the file itself, not just click through.
  const confirmed = formData.get("confirmDuplicate") === "true";
  if (!confirmed) {
    const previous = await loadMostRecentScom205SnapshotBefore(date, admin.branch);
    if (previous && totalsMatch(totals, previous.totals)) {
      return NextResponse.json({
        duplicate: true,
        previousDate: previous.date,
        previousFileName: previous.sourceFileName,
        message: `This looks identical to your upload from ${previous.date} (${previous.sourceFileName}) — same GUS/BPU totals. Are you sure this is ${date}'s file?`,
      });
    }
  }

  const uploadedAt = new Date().toISOString();
  await saveScom205Snapshot({
    date,
    branch: admin.branch,
    uploadedAt,
    sourceFileName: file.name,
    totals,
  });
  await saveRawUploadRows({
    reportType: "scom205",
    date,
    uploadedAt,
    sourceFileName: file.name,
    rows: rawRows.map((data) => ({ branch: admin.branch, data })),
  });

  return NextResponse.json({ success: true, date, branch: admin.branch, totals });
}
