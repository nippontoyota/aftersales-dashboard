import { NextResponse } from "next/server";
import { listAccessoriesStaffNamesForBranch } from "@/lib/accessories-staff-store";
import { listBranchCodes } from "@/lib/admin-store";
import { getCurrentAdmin } from "@/lib/auth";
import { parsePartSaleWorkbook } from "@/lib/part-sale/parse";
import { savePartSaleSnapshot } from "@/lib/part-sale/store";
import { detectReportType } from "@/lib/report-sniffer";
import { parseScom205Workbook } from "@/lib/scom205/parse";
import { saveScom205Snapshot } from "@/lib/scom205/store";
import { parseServiceInfoWorkbook } from "@/lib/service-info/parse";
import { saveServiceInfoSnapshot } from "@/lib/service-info/store";
import { parseSsrv089Workbook } from "@/lib/ssrv089/parse";
import { saveSsrv089Snapshot } from "@/lib/ssrv089/store";

/**
 * The confirm/save half of Upload Sheet (HQ-only, /upload-sheet). Report
 * type is re-detected here from the file bytes rather than trusting
 * whatever the client showed after /detect — the client can't tamper with
 * what gets parsed. Branch is the one thing that's never inferred: it's
 * exactly what the HQ admin confirmed in the form, checked here only
 * against the real list of branch codes. SSRV089 always saves as the
 * "General" variant — Body & Paint was dropped entirely (2026-08-31, at
 * the user's request — it never fed any dashboard formula).
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

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Choose a valid date for this upload." }, { status: 400 });
  }
  const branchCodes = await listBranchCodes();
  if (!branchCodes.includes(branch)) {
    return NextResponse.json({ error: "Choose a valid branch." }, { status: 400 });
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

  const uploadedAt = new Date().toISOString();

  try {
    if (type === "service-info") {
      const counts = parseServiceInfoWorkbook(buffer, branch);
      await saveServiceInfoSnapshot({ date, branch, uploadedAt, sourceFileName: file.name, counts });
      return NextResponse.json({ success: true, type, date, branch, counts });
    }

    if (type === "part-sale") {
      const counts = parsePartSaleWorkbook(buffer);
      await savePartSaleSnapshot({ date, branch, uploadedAt, sourceFileName: file.name, counts });
      return NextResponse.json({ success: true, type, date, branch, counts });
    }

    if (type === "ssrv089") {
      const staffNames = await listAccessoriesStaffNamesForBranch(branch);
      const totals = parseSsrv089Workbook(buffer, staffNames);
      await saveSsrv089Snapshot({ date, branch, variant: "general", uploadedAt, sourceFileName: file.name, totals });
      return NextResponse.json({ success: true, type, date, branch, totals });
    }

    // type === "scom205"
    const totals = parseScom205Workbook(buffer);
    await saveScom205Snapshot({ date, branch, uploadedAt, sourceFileName: file.name, totals });
    return NextResponse.json({ success: true, type, date, branch, totals });
  } catch (err) {
    return NextResponse.json(
      { error: `Could not parse this file: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 422 }
    );
  }
}
