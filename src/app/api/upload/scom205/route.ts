import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { totalsMatch } from "@/lib/duplicate-detection";
import { saveRawUploadRows } from "@/lib/raw-upload-rows/store";
import { parseScom205Workbook } from "@/lib/scom205/parse";
import { loadAllScom205SnapshotsBefore, loadScom205Snapshot, saveScom205Snapshot } from "@/lib/scom205/store";
import { checkGrowth, checkPeriodHeaderSanity } from "@/lib/scom205/upload-validation";

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

  let totals, rawRows, stockAndServiceRate;
  try {
    ({ totals, rawRows, stockAndServiceRate } = parseScom205Workbook(buffer));
  } catch (err) {
    return NextResponse.json(
      { error: `Could not parse this file: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 422 }
    );
  }

  // Period-header sanity check (2026-09-24) — TL01A uploaded a genuine
  // September 2024 KPI export under today's date; its own header literally
  // said so. See scom205/upload-validation.ts.
  const periodSanity = checkPeriodHeaderSanity(rawRows, date);
  if (!periodSanity.ok) {
    return NextResponse.json({ error: periodSanity.error }, { status: 422 });
  }

  // Growth check (2026-09-24) — the four cumulative-MTD totals must never be
  // lower than the branch's most recent prior upload this month. See
  // scom205/upload-validation.ts.
  const growth = await checkGrowth(admin.branch, date, totals);
  if (!growth.ok) {
    return NextResponse.json({ error: growth.error }, { status: 422 });
  }

  // Hard-blocking duplicate check (2026-09-16, at the user's request; upgraded
  // from warn-and-allow to a hard reject 2026-09-24) — TI01C repeatedly
  // resent an earlier day's KPI file under a new date this month, silently
  // freezing GUS/BPU Parts & Labour MTD. scom205's four totals are
  // cumulative-MTD, so an exact match against *any* of the branch's prior
  // uploads this month is a strong "this is an old file again" signal —
  // checked against every prior date, not just the most recent one, after
  // TI01C resent its 10 Sept file again on the 15th with a real upload (the
  // 14th) sitting in between (caught 2026-09-16). A genuine false positive
  // now needs HQ (Upload Sheet).
  const priorSnapshots = await loadAllScom205SnapshotsBefore(date, admin.branch);
  const exactMatch = priorSnapshots.find((s) => totalsMatch(totals, s.totals));
  if (exactMatch) {
    return NextResponse.json(
      {
        error: `This looks identical to your upload from ${exactMatch.date} (${exactMatch.sourceFileName}) — same GUS/BPU totals. If this really is ${date}'s file, contact HQ (Upload Sheet).`,
      },
      { status: 422 }
    );
  }

  const uploadedAt = new Date().toISOString();
  await saveScom205Snapshot({
    date,
    branch: admin.branch,
    uploadedAt,
    sourceFileName: file.name,
    totals,
    stockAndServiceRate,
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
