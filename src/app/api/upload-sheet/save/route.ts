import { NextResponse } from "next/server";
import { listAccessoriesStaffNamesForBranch } from "@/lib/accessories-staff-store";
import { listBranchCodes } from "@/lib/admin-store";
import { getCurrentAdmin } from "@/lib/auth";
import { hashRows } from "@/lib/duplicate-detection";
import { parsePartSaleWorkbook } from "@/lib/part-sale/parse";
import { savePartSaleSnapshot } from "@/lib/part-sale/store";
import { checkBillOverlap } from "@/lib/part-sale/upload-validation";
import { saveRawReportUpload } from "@/lib/raw-report-uploads/store";
import { loadAllRawUploadRowsBefore, saveRawUploadRows } from "@/lib/raw-upload-rows/store";
import { detectReportType } from "@/lib/report-sniffer";
import { ONLINE_STORE_CODES } from "@/lib/report";
import { parseScom205Workbook } from "@/lib/scom205/parse";
import { saveScom205Snapshot } from "@/lib/scom205/store";
import { parseServiceInfoWorkbook } from "@/lib/service-info/parse";
import { saveServiceInfoSnapshot } from "@/lib/service-info/store";
import { checkInvoiceDateSanity, checkRoOverlap } from "@/lib/service-info/upload-validation";
import { saveServiceInfoBpSnapshot } from "@/lib/service-info-bp/store";
import { parseSsrv089Workbook } from "@/lib/ssrv089/parse";
import { saveSsrv089Snapshot } from "@/lib/ssrv089/store";

/**
 * The confirm/save half of Upload Sheet (HQ-only, /upload-sheet). Report
 * type is re-detected here from the file bytes rather than trusting
 * whatever the client showed after /detect — the client can't tamper with
 * what gets parsed. Branch is the one thing that's never inferred: it's
 * exactly what the HQ admin confirmed in the form, checked here only
 * against the real list of branch codes.
 *
 * Service Info and SSRV089 each need one more thing confirmed by hand: the
 * GS/BP variant (2026-09-01, at the user's request) — the file signature
 * alone can't tell them apart, same reason the old SSRV089 General/Body &
 * Paint picker existed before it was dropped 2026-08-31. GS parses and
 * feeds the real dashboard figures exactly as before. SSRV089 BP just
 * stores the file as-is, unparsed (see raw-report-uploads/store.ts). Service
 * Info BP also always stores the file as-is, but (2026-09-11, at the user's
 * request) is now additionally parsed for Wheel Balancing / Wheel Alignment
 * / Brake Skimming / VAS Revenue — never Evaporator Cleaning, which stays
 * GS-only — added onto the branch's GS totals at read time (see
 * loadCombinedServiceInfoSnapshots* in service-info/store.ts).
 */
export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (admin.role !== "hq") {
    return NextResponse.json({ error: "Only an HQ account can use Upload Sheet." }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const date = String(formData.get("date") ?? "").trim();
  const branch = String(formData.get("branch") ?? "").trim();
  // Only meaningful for service-info/ssrv089 — defaults to "gs" so a
  // missing/unexpected value never silently falls into the unparsed BP path.
  const variant = String(formData.get("variant") ?? "gs").trim() === "bp" ? "bp" : "gs";

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Choose a valid date for this upload." }, { status: 400 });
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Could not read the uploaded file." }, { status: 400 });
  }

  const type = detectReportType(buffer);
  if (!type) {
    return NextResponse.json(
      { error: "Could not recognize this file as a Service Info, Part Sale, SSRV089, or scom205 report." },
      { status: 422 }
    );
  }

  // An online store (e.g. CO01C) only ever files a Part Sale Report — its
  // code is deliberately absent from listBranchCodes() (not a real branch,
  // no other report type applies to it), so it's only accepted here when
  // that's the detected type.
  const branchCodes = await listBranchCodes();
  const allowedBranches = type === "part-sale" ? [...branchCodes, ...ONLINE_STORE_CODES] : branchCodes;
  if (!allowedBranches.includes(branch)) {
    return NextResponse.json({ error: "Choose a valid branch." }, { status: 400 });
  }

  const uploadedAt = new Date().toISOString();

  try {
    if (type === "service-info") {
      if (variant === "bp") {
        await saveRawReportUpload({ date, branch, reportType: "service_info_bp", uploadedAt, sourceFileName: file.name, fileData: buffer });
        let bpCounts = null;
        try {
          const bpStaffNames = await listAccessoriesStaffNamesForBranch(branch);
          const { counts } = parseServiceInfoWorkbook(buffer, branch, bpStaffNames);
          await saveServiceInfoBpSnapshot({ date, branch, uploadedAt, sourceFileName: file.name, counts });
          bpCounts = counts;
        } catch {
          // Same as the branch upload route — an unexpected file shape just
          // means nothing gets pulled from it; the raw file above still saves.
        }
        return NextResponse.json({ success: true, type, variant, date, branch, sourceFileName: file.name, bpCounts });
      }
      const svcInfoStaffNames = await listAccessoriesStaffNamesForBranch(branch);
      const { counts, rawRows } = parseServiceInfoWorkbook(buffer, branch, svcInfoStaffNames);

      // Same two checks as the branch's own upload route (2026-09-19, after
      // the CO01A/KL01A incidents — both went through this exact tool,
      // which previously had no validation of any kind) — see
      // service-info/upload-validation.ts.
      const dateSanity = checkInvoiceDateSanity(rawRows, date);
      if (!dateSanity.ok) {
        return NextResponse.json({ error: dateSanity.error }, { status: 422 });
      }
      const confirmed = formData.get("confirmDuplicate") === "true";
      if (!confirmed) {
        const overlap = await checkRoOverlap(branch, rawRows, date);
        if (overlap.duplicate) {
          return NextResponse.json({ duplicate: true, message: overlap.message });
        }
      }

      await saveServiceInfoSnapshot({ date, branch, uploadedAt, sourceFileName: file.name, counts });
      await saveRawUploadRows({ reportType: "service_info", date, uploadedAt, sourceFileName: file.name, rows: rawRows.map((data) => ({ branch, data })) });
      return NextResponse.json({ success: true, type, variant, date, branch, counts });
    }

    if (type === "part-sale") {
      const { counts, rawRows } = await parsePartSaleWorkbook(buffer, branch, date);

      // Same two duplicate checks as the branch's own upload route
      // (2026-09-21, after IR01A's "17 Sep" mislabeled partial-pull incident
      // went through this exact tool, which previously had no duplicate
      // check at all for Part Sale) — see part-sale/upload-validation.ts.
      const confirmed = formData.get("confirmDuplicate") === "true";
      if (!confirmed) {
        const priorUploads = await loadAllRawUploadRowsBefore("part_sale", branch, date);
        const newHash = hashRows(rawRows);
        const match = priorUploads.find((u) => hashRows(u.rows) === newHash);
        if (match) {
          return NextResponse.json({
            duplicate: true,
            previousDate: match.date,
            message: `This file looks identical to the ${match.date} upload — same rows. Are you sure this is ${date}'s file?`,
          });
        }

        const overlap = await checkBillOverlap(branch, rawRows, date);
        if (overlap.duplicate) {
          return NextResponse.json({ duplicate: true, message: overlap.message });
        }
      }

      await savePartSaleSnapshot({ date, branch, uploadedAt, sourceFileName: file.name, counts });
      await saveRawUploadRows({ reportType: "part_sale", date, uploadedAt, sourceFileName: file.name, rows: rawRows.map((data) => ({ branch, data })) });
      return NextResponse.json({ success: true, type, date, branch, counts });
    }

    if (type === "ssrv089") {
      if (variant === "bp") {
        await saveRawReportUpload({ date, branch, reportType: "ssrv089_bp", uploadedAt, sourceFileName: file.name, fileData: buffer });
        return NextResponse.json({ success: true, type, variant, date, branch, sourceFileName: file.name });
      }
      const staffNames = await listAccessoriesStaffNamesForBranch(branch);
      const { totals, rawRows } = parseSsrv089Workbook(buffer, staffNames);
      await saveSsrv089Snapshot({ date, branch, variant: "general", uploadedAt, sourceFileName: file.name, totals });
      await saveRawUploadRows({ reportType: "ssrv089", date, uploadedAt, sourceFileName: file.name, rows: rawRows.map((data) => ({ branch, data })) });
      return NextResponse.json({ success: true, type, variant, date, branch, totals });
    }

    // type === "scom205"
    const { totals, rawRows, stockAndServiceRate } = parseScom205Workbook(buffer);
    await saveScom205Snapshot({ date, branch, uploadedAt, sourceFileName: file.name, totals, stockAndServiceRate });
    await saveRawUploadRows({ reportType: "scom205", date, uploadedAt, sourceFileName: file.name, rows: rawRows.map((data) => ({ branch, data })) });
    return NextResponse.json({ success: true, type, date, branch, totals });
  } catch (err) {
    return NextResponse.json(
      { error: `Could not parse this file: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 422 }
    );
  }
}
