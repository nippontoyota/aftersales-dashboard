import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { parseScom205Workbook } from "@/lib/scom205/parse";
import { loadScom205Snapshot, saveScom205Snapshot } from "@/lib/scom205/store";

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

  let totals;
  try {
    totals = parseScom205Workbook(buffer);
  } catch (err) {
    return NextResponse.json(
      { error: `Could not parse this file: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 422 }
    );
  }

  await saveScom205Snapshot({
    date,
    branch: admin.branch,
    uploadedAt: new Date().toISOString(),
    sourceFileName: file.name,
    totals,
  });

  return NextResponse.json({ success: true, date, branch: admin.branch, totals });
}
