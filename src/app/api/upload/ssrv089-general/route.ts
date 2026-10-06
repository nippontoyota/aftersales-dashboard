import { NextResponse } from "next/server";
import { listAccessoriesStaffNamesForBranch } from "@/lib/accessories-staff-store";
import { getCurrentAdmin } from "@/lib/auth";
import { recomputeAfterSsrv089Upload } from "@/lib/cancellation/adjustment-recompute";
import { pool } from "@/lib/db";
import { hashRows } from "@/lib/duplicate-detection";
import { findDuplicateBatch, saveRawUploadRows } from "@/lib/raw-upload-rows/store";
import { parseSsrv089Workbook } from "@/lib/ssrv089/parse";
import { loadSsrv089Snapshot, saveSsrv089Snapshot } from "@/lib/ssrv089/store";
import { checkInvoiceDocDateSanity, checkInvoiceOverlap } from "@/lib/ssrv089/upload-validation";

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (admin.role !== "branch") {
    return NextResponse.json({ error: "Only a branch account can upload an SSRV089 report." }, { status: 403 });
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
  if (await loadSsrv089Snapshot(date, admin.branch, "general")) {
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
    const staffNames = await listAccessoriesStaffNamesForBranch(admin.branch);
    ({ totals, rawRows } = parseSsrv089Workbook(buffer, staffNames));
  } catch (err) {
    return NextResponse.json(
      { error: `Could not parse this file: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 422 }
    );
  }

  // Date-sanity check (2026-09-24, same month-level logic Service Info has
  // had since 2026-09-19 — see upload-date-sanity.ts / ssrv089/
  // upload-validation.ts).
  const dateSanity = checkInvoiceDocDateSanity(rawRows, date);
  if (!dateSanity.ok) {
    return NextResponse.json({ error: dateSanity.error }, { status: 422 });
  }

  // Hard-blocking duplicate check (2026-09-16, at the user's request; upgraded
  // from warn-and-allow to a hard reject 2026-09-24). This is the report type
  // that caused the most repeat trouble this month — TI01C resent the same
  // Cost & Sales file on the 11th and 13th, then *again* on the 15th
  // against the 10th specifically, skipping right over a real upload on the
  // 14th, which is exactly why every prior date is checked here now, not
  // just the most recent one. A genuine false positive now needs HQ
  // (Upload Sheet).
  const newHash = hashRows(rawRows);
  const duplicateDate = await findDuplicateBatch("ssrv089", admin.branch, date, newHash);
  if (duplicateDate) {
    return NextResponse.json(
      { error: `This file looks identical to your upload from ${duplicateDate} — same rows. If this really is ${date}'s file, contact HQ (Upload Sheet).` },
      { status: 422 }
    );
  }

  // Partial-duplicate check (2026-10-05) — catches a resend that isn't
  // byte-identical to any single prior upload (extra/missing rows), which
  // the exact-hash check above can't see. See ssrv089/upload-validation.ts.
  const overlap = await checkInvoiceOverlap(admin.branch, rawRows, date);
  if (overlap.duplicate) {
    return NextResponse.json({ error: `${overlap.message} If this really is new data, contact HQ (Upload Sheet).` }, { status: 422 });
  }

  const uploadedAt = new Date().toISOString();
  const dbClient = await pool.connect();
  try {
    await dbClient.query("begin");
    await saveSsrv089Snapshot(
      { date, branch: admin.branch, variant: "general", uploadedAt, sourceFileName: file.name, totals, uploadedBy: admin.username },
      dbClient
    );
    await saveRawUploadRows(
      { reportType: "ssrv089", date, uploadedAt, sourceFileName: file.name, rows: rawRows.map((data) => ({ branch: admin.branch, data })), uploadedBy: admin.username, contentHash: newHash },
      dbClient
    );
    await dbClient.query("commit");
  } catch {
    await dbClient.query("rollback");
    return NextResponse.json({ error: "Failed to save upload — please try again." }, { status: 500 });
  } finally {
    dbClient.release();
  }

  // Outside the upload transaction — a recompute failure shouldn't roll back
  // an otherwise-successful upload (see adjustment-recompute.ts).
  await recomputeAfterSsrv089Upload(admin.branch, date);

  return NextResponse.json({ success: true, date, branch: admin.branch, totals });
}
