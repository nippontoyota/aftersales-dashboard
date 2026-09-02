import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { parseBillPdf } from "@/lib/bill/parse";
import { loadBillByInvoiceNumber, saveBillUpload, type BillCategory } from "@/lib/bill/store";

type FileResult = {
  fileName: string;
  success?: boolean;
  invoiceNumber?: string;
  taxableValue?: number;
  error?: string;
  needsManualEntry?: boolean;
  partialData?: { invoiceNumber: string | null; taxableValue: number | null };
};

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const branch = admin.role === "branch" ? admin.branch : null;
  if (!branch) {
    return NextResponse.json({ error: "Only a branch account can upload bills." }, { status: 403 });
  }

  const formData = await request.formData();
  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  const manualInvoiceNumber = String(formData.get("manualInvoiceNumber") ?? "").trim() || null;
  const manualTaxableValueStr = String(formData.get("manualTaxableValue") ?? "").trim();
  const manualTaxableValue = manualTaxableValueStr ? parseFloat(manualTaxableValueStr) : null;

  const categoryRaw = String(formData.get("category") ?? "").trim();
  if (categoryRaw !== "scrap" && categoryRaw !== "used_oil") {
    return NextResponse.json({ error: "Choose a revenue type (Scrap or Used Oil) for this upload." }, { status: 400 });
  }
  const category: BillCategory = categoryRaw;

  if (files.length === 0) {
    return NextResponse.json({ error: "Choose at least one PDF file to upload." }, { status: 400 });
  }

  const results: FileResult[] = [];

  for (const file of files) {
    const fileName = file.name;

    if (!fileName.toLowerCase().endsWith(".pdf")) {
      results.push({ fileName, error: "Only PDF files are accepted." });
      continue;
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(await file.arrayBuffer());
    } catch {
      results.push({ fileName, error: "Could not read the file." });
      continue;
    }

    let invoiceNumber: string | null = null;
    let taxableValue: number | null = null;
    let extractionMethod: "auto" | "manual" = "auto";

    try {
      const parsed = await parseBillPdf(buffer);
      invoiceNumber = parsed.invoiceNumber;
      taxableValue = parsed.taxableValue;
    } catch {
      // extraction failed — fall through to manual check
    }

    if (files.length === 1 && manualInvoiceNumber) {
      invoiceNumber = manualInvoiceNumber;
      extractionMethod = "manual";
    }
    if (files.length === 1 && manualTaxableValue !== null && !isNaN(manualTaxableValue)) {
      taxableValue = manualTaxableValue;
      extractionMethod = "manual";
    }

    if (!invoiceNumber || taxableValue === null) {
      results.push({
        fileName,
        needsManualEntry: true,
        partialData: { invoiceNumber, taxableValue },
      });
      continue;
    }

    const existing = await loadBillByInvoiceNumber(invoiceNumber);
    if (existing) {
      results.push({
        fileName,
        error: `Invoice ${invoiceNumber} has already been uploaded (on ${new Date(existing.uploadedAt).toLocaleDateString("en-IN")}).`,
      });
      continue;
    }

    try {
      await saveBillUpload({
        invoiceNumber,
        branch,
        taxableValue,
        category,
        fileData: buffer,
        sourceFileName: fileName,
        uploadedAt: new Date().toISOString(),
        uploadedBy: admin.username,
        extractionMethod,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      if (msg.includes("unique") || msg.includes("duplicate")) {
        results.push({ fileName, error: `Invoice ${invoiceNumber} has already been uploaded.` });
      } else {
        results.push({ fileName, error: `Database save failed: ${msg}` });
      }
      continue;
    }

    results.push({ fileName, success: true, invoiceNumber, taxableValue });
  }

  const allSuccess = results.every((r) => r.success);
  const anyNeedsManual = results.some((r) => r.needsManualEntry);

  return NextResponse.json({ results, allSuccess, anyNeedsManual });
}
