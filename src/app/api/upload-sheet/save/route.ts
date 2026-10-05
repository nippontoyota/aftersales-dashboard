import { NextResponse } from "next/server";
import { listAccessoriesStaffNamesForBranch } from "@/lib/accessories-staff-store";
import { listBranchCodes } from "@/lib/admin-store";
import { getCurrentAdmin } from "@/lib/auth";
import { recomputeAfterSsrv089Upload } from "@/lib/cancellation/adjustment-recompute";
import { pool } from "@/lib/db";
import { hashBuffer, hashRows, totalsMatch } from "@/lib/duplicate-detection";
import { parsePartSaleWorkbook } from "@/lib/part-sale/parse";
import { savePartSaleSnapshot } from "@/lib/part-sale/store";
import { checkBillOverlap } from "@/lib/part-sale/upload-validation";
import { loadAllRawReportUploadsBefore, saveRawReportUpload } from "@/lib/raw-report-uploads/store";
import { findDuplicateBatch, saveRawUploadRows } from "@/lib/raw-upload-rows/store";
import { detectReportType } from "@/lib/report-sniffer";
import { ONLINE_STORE_CODES } from "@/lib/report";
import { parseScom205Workbook } from "@/lib/scom205/parse";
import { loadAllScom205SnapshotsBefore, saveScom205Snapshot } from "@/lib/scom205/store";
import { checkGrowth, checkPeriodHeaderSanity } from "@/lib/scom205/upload-validation";
import { parseServiceInfoWorkbook } from "@/lib/service-info/parse";
import { saveServiceInfoSnapshot } from "@/lib/service-info/store";
import { checkInvoiceDateSanity, checkRoOverlap } from "@/lib/service-info/upload-validation";
import { saveServiceInfoBpSnapshot } from "@/lib/service-info-bp/store";
import { parseSsrv089Workbook } from "@/lib/ssrv089/parse";
import { saveSsrv089Snapshot } from "@/lib/ssrv089/store";
import { checkInvoiceDocDateSanity, checkInvoiceOverlap } from "@/lib/ssrv089/upload-validation";
import { parseSsrv089BpGreyTotals } from "@/lib/ssrv089-bp/parse";
import { saveSsrv089BpGreySnapshot } from "@/lib/ssrv089-bp/store";

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
  // Raw, undefaulted — only meaningful for service-info/ssrv089, validated
  // once `type` is known below. No silent "gs" fallback (2026-10-05, after
  // TI01A's 2026-09-23 incident: the UI used to pre-select GS and a BP file
  // got saved under it unnoticed) — a missing/invalid value is now rejected
  // outright rather than assumed.
  const rawVariant = formData.get("variant");
  const variantInput = typeof rawVariant === "string" ? rawVariant.trim() : "";

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

  // Service Info and SSRV089 both need the GS/BP variant explicitly
  // confirmed — the file signature alone can't tell them apart (see this
  // route's doc comment). No default: a missing or invalid value is
  // rejected, never silently treated as GS.
  const needsVariant = type === "service-info" || type === "ssrv089";
  if (needsVariant && variantInput !== "gs" && variantInput !== "bp") {
    return NextResponse.json({ error: "Choose whether this is the GS or BP file." }, { status: 400 });
  }
  const variant: "gs" | "bp" = variantInput === "bp" ? "bp" : "gs";

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
        // Structural check — a parse failure throws, caught by this
        // function's outer try/catch below, same hard-reject-nothing-saved
        // behavior as the branch's own route (upgraded 2026-10-05 from a
        // silent swallow that let a wrong file through with no error at all
        // — see service-info-bp/route.ts's doc comment for the incident).
        const bpStaffNames = await listAccessoriesStaffNamesForBranch(branch);
        const { counts: bpCounts } = parseServiceInfoWorkbook(buffer, branch, bpStaffNames);

        // Soft, click-through duplicate check (added 2026-10-05 — this
        // branch previously had none at all). Stays soft here, unlike the
        // branch's own route's hard reject, since Upload Sheet is HQ's
        // intended override path for every other hard reject too.
        const confirmed = formData.get("confirmDuplicate") === "true";
        if (!confirmed) {
          const priorUploads = await loadAllRawReportUploadsBefore(branch, "service_info_bp", date);
          const newHash = hashBuffer(buffer);
          const match = priorUploads.find((u) => hashBuffer(u.fileData) === newHash);
          if (match) {
            return NextResponse.json({
              duplicate: true,
              previousDate: match.date,
              message: `This file looks identical to the ${match.date} upload (${match.sourceFileName}). Are you sure this is ${date}'s file?`,
            });
          }
        }

        await saveRawReportUpload({ date, branch, reportType: "service_info_bp", uploadedAt, sourceFileName: file.name, fileData: buffer, uploadedBy: admin.username });
        await saveServiceInfoBpSnapshot({ date, branch, uploadedAt, sourceFileName: file.name, counts: bpCounts, uploadedBy: admin.username });
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

      const siHash = hashRows(rawRows);
      const siClient = await pool.connect();
      try {
        await siClient.query("begin");
        await saveServiceInfoSnapshot({ date, branch, uploadedAt, sourceFileName: file.name, counts, uploadedBy: admin.username }, siClient);
        await saveRawUploadRows(
          { reportType: "service_info", date, uploadedAt, sourceFileName: file.name, rows: rawRows.map((data) => ({ branch, data })), uploadedBy: admin.username, contentHash: siHash },
          siClient
        );
        await siClient.query("commit");
      } catch {
        await siClient.query("rollback");
        return NextResponse.json({ error: "Failed to save upload — please try again." }, { status: 500 });
      } finally {
        siClient.release();
      }
      return NextResponse.json({ success: true, type, variant, date, branch, counts });
    }

    if (type === "part-sale") {
      const { counts, rawRows } = await parsePartSaleWorkbook(buffer, branch, date);

      // Same two duplicate checks as the branch's own upload route
      // (2026-09-21, after IR01A's "17 Sep" mislabeled partial-pull incident
      // went through this exact tool, which previously had no duplicate
      // check at all for Part Sale) — see part-sale/upload-validation.ts.
      const psHash = hashRows(rawRows);
      const confirmed = formData.get("confirmDuplicate") === "true";
      if (!confirmed) {
        const matchDate = await findDuplicateBatch("part_sale", branch, date, psHash);
        if (matchDate) {
          return NextResponse.json({
            duplicate: true,
            previousDate: matchDate,
            message: `This file looks identical to the ${matchDate} upload — same rows. Are you sure this is ${date}'s file?`,
          });
        }

        const overlap = await checkBillOverlap(branch, rawRows, date);
        if (overlap.duplicate) {
          return NextResponse.json({ duplicate: true, message: overlap.message });
        }
      }

      const psClient = await pool.connect();
      try {
        await psClient.query("begin");
        await savePartSaleSnapshot({ date, branch, uploadedAt, sourceFileName: file.name, counts, uploadedBy: admin.username }, psClient);
        await saveRawUploadRows(
          { reportType: "part_sale", date, uploadedAt, sourceFileName: file.name, rows: rawRows.map((data) => ({ branch, data })), uploadedBy: admin.username, contentHash: psHash },
          psClient
        );
        await psClient.query("commit");
      } catch {
        await psClient.query("rollback");
        return NextResponse.json({ error: "Failed to save upload — please try again." }, { status: 500 });
      } finally {
        psClient.release();
      }
      return NextResponse.json({ success: true, type, date, branch, counts });
    }

    if (type === "ssrv089") {
      if (variant === "bp") {
        // Structural check (2026-10-01) — same validation as the branch's
        // own upload route (ssrv089-bp/route.ts), so a wrong-report-type or
        // unreadable file can't sneak through via Upload Sheet either. A
        // throw here is caught by this function's outer try/catch below,
        // same as every other parse failure in this file. A correctly-shaped
        // but zero-row file (2026-10-02, see ssrv089-bp/parse.ts) is still
        // accepted — just surfaced as a warning rather than silently saved.
        const parsed = parseSsrv089BpGreyTotals(buffer);

        // Soft, click-through duplicate check (added 2026-10-05 — this
        // branch previously had none at all, unlike every other type here).
        // Stays soft, same reasoning as Service Info BP's equivalent above.
        const confirmed = formData.get("confirmDuplicate") === "true";
        if (!confirmed) {
          const priorUploads = await loadAllRawReportUploadsBefore(branch, "ssrv089_bp", date);
          const newHash = hashBuffer(buffer);
          const match = priorUploads.find((u) => hashBuffer(u.fileData) === newHash);
          if (match) {
            return NextResponse.json({
              duplicate: true,
              previousDate: match.date,
              message: `This file looks identical to the ${match.date} upload (${match.sourceFileName}). Are you sure this is ${date}'s file?`,
            });
          }
        }

        await saveRawReportUpload({ date, branch, reportType: "ssrv089_bp", uploadedAt, sourceFileName: file.name, fileData: buffer, uploadedBy: admin.username });
        await saveSsrv089BpGreySnapshot({ date, branch, uploadedAt, sourceFileName: file.name, totals: parsed.totals });
        return NextResponse.json({
          success: true,
          type,
          variant,
          date,
          branch,
          sourceFileName: file.name,
          warning: parsed.isEmpty
            ? "This file has the right structure but contains no data rows. If the branch had Cost and Sales - BP business this day, check the export — this might be a partial or broken pull from the DMS."
            : undefined,
        });
      }
      const staffNames = await listAccessoriesStaffNamesForBranch(branch);
      const { totals, rawRows } = parseSsrv089Workbook(buffer, staffNames);

      // Same two checks as the branch's own upload route (2026-09-30, after a
      // duplicate SSRV089 upload for MV01A landed through this exact tool
      // with no validation of any kind — Service Info and Part Sale right
      // above already had both; SSRV089 never did) — see
      // ssrv089/upload-validation.ts.
      const dateSanity = checkInvoiceDocDateSanity(rawRows, date);
      if (!dateSanity.ok) {
        return NextResponse.json({ error: dateSanity.error }, { status: 422 });
      }
      const sv089Hash = hashRows(rawRows);
      const confirmed = formData.get("confirmDuplicate") === "true";
      if (!confirmed) {
        const matchDate = await findDuplicateBatch("ssrv089", branch, date, sv089Hash);
        if (matchDate) {
          return NextResponse.json({
            duplicate: true,
            previousDate: matchDate,
            message: `This file looks identical to the ${matchDate} upload — same rows. Are you sure this is ${date}'s file?`,
          });
        }
        // Partial-duplicate check (2026-10-05) — same as the branch's own
        // route, but soft/click-through here, matching Service Info's
        // RO-overlap equivalent above (Upload Sheet is HQ's override path).
        const overlap = await checkInvoiceOverlap(branch, rawRows, date);
        if (overlap.duplicate) {
          return NextResponse.json({ duplicate: true, message: overlap.message });
        }
      }

      const sv089Client = await pool.connect();
      try {
        await sv089Client.query("begin");
        await saveSsrv089Snapshot({ date, branch, variant: "general", uploadedAt, sourceFileName: file.name, totals, uploadedBy: admin.username }, sv089Client);
        await saveRawUploadRows(
          { reportType: "ssrv089", date, uploadedAt, sourceFileName: file.name, rows: rawRows.map((data) => ({ branch, data })), uploadedBy: admin.username, contentHash: sv089Hash },
          sv089Client
        );
        await sv089Client.query("commit");
      } catch {
        await sv089Client.query("rollback");
        return NextResponse.json({ error: "Failed to save upload — please try again." }, { status: 500 });
      } finally {
        sv089Client.release();
      }
      await recomputeAfterSsrv089Upload(branch, date);
      return NextResponse.json({ success: true, type, variant, date, branch, totals });
    }

    // type === "scom205" — previously had zero validation here (2026-10-05
    // fix): no period-header check, no growth check, no duplicate check,
    // unlike every other type in this file and unlike the branch's own
    // scom205/route.ts, which has all three. Mirrors that route exactly:
    // period-header and growth are hard rejects (same as every other sanity
    // check in this file), the exact-duplicate check stays soft/click-through
    // (same as every other duplicate check in this file — Upload Sheet is
    // HQ's override path).
    const { totals, rawRows, stockAndServiceRate } = parseScom205Workbook(buffer);

    const periodSanity = checkPeriodHeaderSanity(rawRows, date);
    if (!periodSanity.ok) {
      return NextResponse.json({ error: periodSanity.error }, { status: 422 });
    }
    const growth = await checkGrowth(branch, date, totals);
    if (!growth.ok) {
      return NextResponse.json({ error: growth.error }, { status: 422 });
    }
    const scConfirmed = formData.get("confirmDuplicate") === "true";
    if (!scConfirmed) {
      const priorSnapshots = await loadAllScom205SnapshotsBefore(date, branch);
      const exactMatch = priorSnapshots.find((s) => totalsMatch(totals, s.totals));
      if (exactMatch) {
        return NextResponse.json({
          duplicate: true,
          previousDate: exactMatch.date,
          message: `This looks identical to the ${exactMatch.date} upload (${exactMatch.sourceFileName}) — same GUS/BPU totals. Are you sure this is ${date}'s file?`,
        });
      }
    }

    const scClient = await pool.connect();
    try {
      await scClient.query("begin");
      await saveScom205Snapshot({ date, branch, uploadedAt, sourceFileName: file.name, totals, stockAndServiceRate, uploadedBy: admin.username }, scClient);
      await saveRawUploadRows(
        { reportType: "scom205", date, uploadedAt, sourceFileName: file.name, rows: rawRows.map((data) => ({ branch, data })), uploadedBy: admin.username },
        scClient
      );
      await scClient.query("commit");
    } catch {
      await scClient.query("rollback");
      return NextResponse.json({ error: "Failed to save upload — please try again." }, { status: 500 });
    } finally {
      scClient.release();
    }
    return NextResponse.json({ success: true, type, date, branch, totals });
  } catch (err) {
    return NextResponse.json(
      { error: `Could not parse this file: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 422 }
    );
  }
}
