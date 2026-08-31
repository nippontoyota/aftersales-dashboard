import { NextResponse } from "next/server";
import { listBranchCodes } from "@/lib/admin-store";
import { getCurrentAdmin } from "@/lib/auth";
import { detectReportType, suggestBranch } from "@/lib/report-sniffer";

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
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Could not read the uploaded file." }, { status: 400 });
  }

  let type;
  try {
    type = detectReportType(buffer);
  } catch (err) {
    return NextResponse.json(
      { error: `Could not read this as a spreadsheet: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 422 }
    );
  }

  if (!type) {
    return NextResponse.json(
      { error: "Could not recognize this file as a Service Info, Part Sale, SSRV089, or scom205 report." },
      { status: 422 }
    );
  }

  const branchCodes = await listBranchCodes();
  const suggestedBranch = suggestBranch(file.name, buffer, branchCodes);

  return NextResponse.json({ type, suggestedBranch, branchCodes, sourceFileName: file.name });
}
