import { NextResponse } from "next/server";
import { listAccessoriesStaffNamesForBranch } from "@/lib/accessories-staff-store";
import { getCurrentAdmin } from "@/lib/auth";
import { hashBuffer } from "@/lib/duplicate-detection";
import { loadAllRawReportUploadsBefore, loadRawReportUpload, saveRawReportUpload } from "@/lib/raw-report-uploads/store";
import { saveRawUploadRows } from "@/lib/raw-upload-rows/store";
import { parseServiceInfoWorkbook } from "@/lib/service-info/parse";
import { saveServiceInfoBpSnapshot } from "@/lib/service-info-bp/store";
import { recomputeVasRevenueReal } from "@/lib/vas-revenue-real/recompute";

/** Service Information Report - BP — required daily like every other
 * upload. The raw file is always kept (see raw-report-uploads/store.ts),
 * same as before 2026-09-11; on top of that it's also parsed with the exact
 * same rules as the GS report (service-info/parse.ts) for Wheel Balancing /
 * Wheel Alignment / Brake Skimming / VAS Revenue — never Evaporator
 * Cleaning, which stays GS-only (at the user's request). Those four get
 * added onto the branch's GS totals at read time (see
 * loadCombinedServiceInfoSnapshots* in service-info/store.ts), not merged
 * into service_info_snapshots itself.
 *
 * A parse failure here now hard-rejects the whole upload (2026-10-05, after
 * TI01A's 2026-09-23 incident: a Body & Paint file got saved into the GS
 * slot, and this route's old silent-swallow let a wrong file through here
 * with no error and no warning at all — same root failure mode, worse,
 * since nothing was even surfaced). A BP job order rarely carries GS-style
 * job codes, so a *correctly-shaped* file with zero matches is still fine
 * (Wheel Balancing/Alignment/Brake Skimming/VAS Revenue all come back 0) —
 * only a file that isn't Service-Info-shaped at all is rejected. */
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

  // Structural check — hard reject, nothing saved (2026-10-05). Parsed
  // before any save so a bad file never gets saved half-done.
  let bpCounts, bpRawRows;
  try {
    const staffNames = await listAccessoriesStaffNamesForBranch(admin.branch);
    ({ counts: bpCounts, rawRows: bpRawRows } = parseServiceInfoWorkbook(buffer, admin.branch, staffNames));
  } catch (err) {
    return NextResponse.json(
      { error: `Could not parse this file: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 422 }
    );
  }

  // Hard-blocking duplicate check (upgraded from warn-and-allow 2026-10-05,
  // matching every other report type — see this route's doc comment). This
  // report type keeps no parsed rows to hash (see raw-report-uploads/
  // store.ts), which is exactly what let TI01C's resent BP file slip past
  // the row-hash check that caught its GS-side twin (see docs/data-
  // reconciliation.md). Compares raw file bytes directly against every
  // prior upload this month, not just the most recent one. A genuine false
  // positive now needs HQ (Upload Sheet).
  const priorUploads = await loadAllRawReportUploadsBefore(admin.branch, "service_info_bp", date);
  const newHash = hashBuffer(buffer);
  const match = priorUploads.find((u) => hashBuffer(u.fileData) === newHash);
  if (match) {
    return NextResponse.json(
      { error: `This file looks identical to your upload from ${match.date} (${match.sourceFileName}). If this really is ${date}'s file, contact HQ (Upload Sheet).` },
      { status: 422 }
    );
  }

  const uploadedAt = new Date().toISOString();
  await saveRawReportUpload({
    date,
    branch: admin.branch,
    reportType: "service_info_bp",
    uploadedAt,
    sourceFileName: file.name,
    fileData: buffer,
    uploadedBy: admin.username,
  });
  await saveServiceInfoBpSnapshot({ date, branch: admin.branch, uploadedAt, sourceFileName: file.name, counts: bpCounts, uploadedBy: admin.username });
  // Every row, individually (2026-10-09) — previously only the aggregate
  // counts above and the whole file as raw bytes (saveRawReportUpload
  // above) were kept, so a BP VAS-coded row couldn't be matched against
  // Labour Sales Report the way a GS one already can (see
  // vas-revenue-real/compute.ts). A separate report_type from GS's
  // 'service_info' — see db/schema.sql's 2026-10-09 comment on why.
  await saveRawUploadRows({
    reportType: "service_info_bp",
    date,
    uploadedAt,
    sourceFileName: file.name,
    rows: bpRawRows.map((data) => ({ branch: admin.branch, data })),
    uploadedBy: admin.username,
  });

  // Outside the saves above — a recompute failure shouldn't block an
  // otherwise-successful upload (see vas-revenue-real/recompute.ts, which
  // already swallows its own errors; this is a no-op before 2026-10-01).
  await recomputeVasRevenueReal(admin.branch, date);

  return NextResponse.json({ success: true, date, branch: admin.branch, sourceFileName: file.name, bpCounts });
}
