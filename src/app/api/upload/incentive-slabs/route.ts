import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { parseIncentiveSlabWorkbook } from "@/lib/incentive-slabs/parse";
import { saveIncentiveSlabTargets } from "@/lib/incentive-slabs/store";

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (admin.role !== "hq") {
    return NextResponse.json({ error: "Only the HQ account can upload incentive slab targets." }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const month = String(formData.get("month") ?? "").trim();

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Choose a valid month for this upload." }, { status: 400 });
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Could not read the uploaded file." }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseIncentiveSlabWorkbook(buffer);
  } catch (err) {
    return NextResponse.json(
      { error: `Could not parse this file: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 422 }
    );
  }

  if (parsed.length === 0) {
    return NextResponse.json({ error: "No recognizable branch rows found in this file." }, { status: 422 });
  }

  await saveIncentiveSlabTargets(month, parsed, admin.username, file.name);

  return NextResponse.json({ month, branchCount: parsed.length, branches: parsed.map((p) => p.branch) });
}
