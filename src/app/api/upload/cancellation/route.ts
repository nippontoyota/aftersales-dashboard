import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { listBranchCodes } from "@/lib/admin-store";
import { parseCancellationReport } from "@/lib/cancellation/parse";
import { saveCancellationReport } from "@/lib/cancellation/store";

type Saved = { branch: string; month: string; count: number; beforeTaxTotal: number; afterTaxTotal: number };
type FileResult = { fileName: string; saved: Saved[]; error?: string; warnings?: string[] };

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (admin.role === "regional") {
    return NextResponse.json({ error: "Regional accounts are read-only." }, { status: 403 });
  }
  // A branch account uploads its own; HQ can upload for any branch (the
  // branch is taken from the report header).
  const ownBranch = admin.role === "branch" ? admin.branch : null;

  const formData = await request.formData();
  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ error: "Choose at least one PDF file to upload." }, { status: 400 });
  }

  const knownBranches = await listBranchCodes();
  const results: FileResult[] = [];

  for (const file of files) {
    const fileName = file.name;
    if (!fileName.toLowerCase().endsWith(".pdf")) {
      results.push({ fileName, saved: [], error: "Only PDF files are accepted." });
      continue;
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(await file.arrayBuffer());
    } catch {
      results.push({ fileName, saved: [], error: "Could not read the file." });
      continue;
    }

    const parsed = await parseCancellationReport(buffer, knownBranches, ownBranch ?? undefined);
    if (parsed.errors.length > 0) {
      results.push({ fileName, saved: [], error: parsed.errors.slice(0, 5).join(" ") });
      continue;
    }
    if (parsed.blocks.length === 0) {
      results.push({ fileName, saved: [], error: "No cancelled-invoice rows found in this file." });
      continue;
    }

    // A branch account may only upload its own branch's report.
    const wrongBranch = ownBranch ? parsed.blocks.find((b) => b.branch !== ownBranch) : undefined;
    if (wrongBranch) {
      results.push({
        fileName,
        saved: [],
        error: `This report is for ${wrongBranch.branch}, but you're signed in as ${ownBranch}.`,
      });
      continue;
    }

    const uploadedAt = new Date().toISOString();
    const saved: Saved[] = [];
    let failed: string | undefined;

    for (const block of parsed.blocks) {
      try {
        await saveCancellationReport({
          branch: block.branch,
          month: block.month,
          rows: block.rows,
          fileData: buffer,
          sourceFileName: fileName,
          uploadedAt,
          uploadedBy: admin.username,
        });
        saved.push({
          branch: block.branch,
          month: block.month,
          count: block.rows.length,
          beforeTaxTotal: round2(block.rows.reduce((s, r) => s + r.beforeTax, 0)),
          afterTaxTotal: round2(block.rows.reduce((s, r) => s + r.afterTax, 0)),
        });
      } catch (err) {
        failed = `Saving ${block.branch} ${block.month} failed: ${err instanceof Error ? err.message : "unknown error"}`;
        break;
      }
    }

    results.push({ fileName, saved, error: failed, warnings: parsed.warnings.length ? parsed.warnings : undefined });
  }

  const allOk = results.every((r) => !r.error && r.saved.length > 0);
  return NextResponse.json({ results, allOk });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
