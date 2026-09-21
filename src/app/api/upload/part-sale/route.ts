import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { hashRows } from "@/lib/duplicate-detection";
import { parsePartSaleWorkbook } from "@/lib/part-sale/parse";
import { loadPartSaleSnapshot, savePartSaleSnapshot } from "@/lib/part-sale/store";
import { checkBillOverlap } from "@/lib/part-sale/upload-validation";
import { loadAllRawUploadRowsBefore, saveRawUploadRows } from "@/lib/raw-upload-rows/store";

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (admin.role !== "branch") {
    return NextResponse.json({ error: "Only a branch account can upload a Part Sale Report." }, { status: 403 });
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
  if (await loadPartSaleSnapshot(date, admin.branch)) {
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
    ({ counts, rawRows } = await parsePartSaleWorkbook(buffer, admin.branch, date));
  } catch (err) {
    return NextResponse.json(
      { error: `Could not parse this file: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 422 }
    );
  }

  // Warn-and-allow duplicate checks (exact-hash: 2026-09-16; bill-overlap:
  // 2026-09-21, after IR01A's "17 Sep" file turned out to be a mislabeled
  // partial pull of the 18th — 101 of its 321 rows, not a whole-file match,
  // so the exact-hash check alone missed it. See part-sale/upload-validation.ts.
  // A branch genuinely combining several days into one export (extra rows for
  // the newer days) hashes differently and has high-but-expected overlap with
  // its own prior days — both checks warn rather than block, same as
  // service-info's. Checked against every prior upload this month, not just
  // the most recent one (see raw-upload-rows/store.ts for why).
  const confirmed = formData.get("confirmDuplicate") === "true";
  if (!confirmed) {
    const priorUploads = await loadAllRawUploadRowsBefore("part_sale", admin.branch, date);
    const newHash = hashRows(rawRows);
    const match = priorUploads.find((u) => hashRows(u.rows) === newHash);
    if (match) {
      return NextResponse.json({
        duplicate: true,
        previousDate: match.date,
        message: `This file looks identical to your upload from ${match.date} — same rows. Are you sure this is ${date}'s file?`,
      });
    }

    const overlap = await checkBillOverlap(admin.branch, rawRows, date);
    if (overlap.duplicate) {
      return NextResponse.json({ duplicate: true, message: overlap.message });
    }
  }

  const uploadedAt = new Date().toISOString();
  await savePartSaleSnapshot({
    date,
    branch: admin.branch,
    uploadedAt,
    sourceFileName: file.name,
    counts,
  });
  await saveRawUploadRows({
    reportType: "part_sale",
    date,
    uploadedAt,
    sourceFileName: file.name,
    rows: rawRows.map((data) => ({ branch: admin.branch, data })),
  });

  return NextResponse.json({ success: true, date, branch: admin.branch, counts });
}
