import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { parseBaToolWorkbook } from "@/lib/ba-tool/parse";
import { saveSnapshot } from "@/lib/snapshot-store";

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (admin.role !== "hq") {
    return NextResponse.json({ error: "Only the HQ account can upload the BA Tool file." }, { status: 403 });
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

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Could not read the uploaded file." }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseBaToolWorkbook(buffer);
  } catch (err) {
    return NextResponse.json(
      { error: `Could not parse this file: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 422 }
    );
  }

  if (parsed.branches.length === 0) {
    return NextResponse.json({ error: "No branch rows found in this file — is it a BA Tool export?" }, { status: 422 });
  }

  await saveSnapshot({
    date,
    uploadedAt: new Date().toISOString(),
    sourceFileName: file.name,
    branches: parsed.branches,
  });

  return NextResponse.json({
    success: true,
    branchCount: parsed.branches.length,
    date,
    unmatchedColumns: parsed.unmatchedColumns,
  });
}
