import { NextResponse } from "next/server";
import { listAccessoriesStaffNamesForBranch } from "@/lib/accessories-staff-store";
import { getCurrentAdmin } from "@/lib/auth";
import { hashRows } from "@/lib/duplicate-detection";
import { loadAllRawUploadRowsBefore, saveRawUploadRows } from "@/lib/raw-upload-rows/store";
import { parseServiceInfoWorkbook } from "@/lib/service-info/parse";
import { loadServiceInfoSnapshot, saveServiceInfoSnapshot } from "@/lib/service-info/store";

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

  // A branch can only ever upload each report once per date (2026-08-31, at
  // the user's request — prevents accidental re-uploads and makes "has this
  // been done today" visible at a glance). HQ's own uploads (BA Tool, and
  // /upload-sheet on a branch's behalf) are never subject to this.
  if (await loadServiceInfoSnapshot(date, admin.branch)) {
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

  let counts, rawRows;
  try {
    const staffNames = await listAccessoriesStaffNamesForBranch(admin.branch);
    ({ counts, rawRows } = parseServiceInfoWorkbook(buffer, admin.branch, staffNames));
  } catch (err) {
    return NextResponse.json(
      { error: `Could not parse this file: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 422 }
    );
  }

  // Warn-and-allow duplicate check (2026-09-16, at the user's request) — see
  // scom205's upload route for the full rationale. This report is a daily
  // row list, not a cumulative total, so the signal is an exact row-content
  // match — checked against every prior upload this month, not just the
  // most recent one (see raw-upload-rows/store.ts for why).
  const confirmed = formData.get("confirmDuplicate") === "true";
  if (!confirmed) {
    const priorUploads = await loadAllRawUploadRowsBefore("service_info", admin.branch, date);
    const newHash = hashRows(rawRows);
    const match = priorUploads.find((u) => hashRows(u.rows) === newHash);
    if (match) {
      return NextResponse.json({
        duplicate: true,
        previousDate: match.date,
        message: `This file looks identical to your upload from ${match.date} — same rows. Are you sure this is ${date}'s file?`,
      });
    }
  }

  const uploadedAt = new Date().toISOString();
  await saveServiceInfoSnapshot({
    date,
    branch: admin.branch,
    uploadedAt,
    sourceFileName: file.name,
    counts,
  });
  await saveRawUploadRows({
    reportType: "service_info",
    date,
    uploadedAt,
    sourceFileName: file.name,
    rows: rawRows.map((data) => ({ branch: admin.branch, data })),
  });

  return NextResponse.json({ success: true, date, branch: admin.branch, counts });
}
