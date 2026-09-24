import { NextResponse } from "next/server";
import { listAccessoriesStaffNamesForBranch } from "@/lib/accessories-staff-store";
import { getCurrentAdmin } from "@/lib/auth";
import { hashRows } from "@/lib/duplicate-detection";
import { loadAllRawUploadRowsBefore, saveRawUploadRows } from "@/lib/raw-upload-rows/store";
import { parseServiceInfoWorkbook } from "@/lib/service-info/parse";
import { loadServiceInfoSnapshot, saveServiceInfoSnapshot } from "@/lib/service-info/store";
import { checkInvoiceDateSanity, checkRoOverlap } from "@/lib/service-info/upload-validation";

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

  // Date-sanity check (2026-09-19, after the CO01A/KL01A incidents — see
  // upload-validation.ts) — a hard block, not a warn-and-confirm: a file
  // whose invoices mostly belong to a different month than the picked date
  // is never a legitimate upload, so there's nothing to confirm through.
  const dateSanity = checkInvoiceDateSanity(rawRows, date);
  if (!dateSanity.ok) {
    return NextResponse.json({ error: dateSanity.error }, { status: 422 });
  }

  // Hard-blocking duplicate checks (2026-09-16, extended 2026-09-19; upgraded
  // from warn-and-allow to a hard reject 2026-09-24, at the user's request —
  // "only then it is accepted") — see scom205's upload route for the full
  // rationale on the exact-hash check, and upload-validation.ts for the
  // RO-overlap check added alongside it (catches a *partial* re-upload the
  // exact-hash check would miss — see TI01B's incident). Both checked
  // against every prior upload ever made, not just this month, since a
  // mislabeled backfill can land months away. A genuine false positive now
  // needs HQ (Upload Sheet) to push it through — there's no more self-service
  // click-through.
  const priorUploads = await loadAllRawUploadRowsBefore("service_info", admin.branch, date);
  const newHash = hashRows(rawRows);
  const exactMatch = priorUploads.find((u) => hashRows(u.rows) === newHash);
  if (exactMatch) {
    return NextResponse.json(
      { error: `This file looks identical to your upload from ${exactMatch.date} — same rows. If this really is ${date}'s file, contact HQ (Upload Sheet).` },
      { status: 422 }
    );
  }

  const overlap = await checkRoOverlap(admin.branch, rawRows, date);
  if (overlap.duplicate) {
    return NextResponse.json({ error: `${overlap.message} If this really is new data, contact HQ (Upload Sheet).` }, { status: 422 });
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
