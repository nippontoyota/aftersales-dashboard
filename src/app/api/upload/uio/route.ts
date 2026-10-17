import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { parseCeWorkbook } from "@/lib/ce/parse";
import { indiaDate } from "@/lib/ce/rules";
import { replaceCeLeads } from "@/lib/ce/store";

const MAX_FILE_BYTES = 15 * 1024 * 1024;

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (admin.role !== "hq") return NextResponse.json({ error: "Only HQ can replace the CE lead workbook." }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose an .xlsx file." }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".xlsx")) return NextResponse.json({ error: "Only .xlsx files are accepted." }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "The workbook exceeds the 15 MB limit." }, { status: 413 });

  let parsed;
  try {
    parsed = parseCeWorkbook(Buffer.from(await file.arrayBuffer()), indiaDate());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not parse the workbook." }, { status: 422 });
  }

  try {
    return NextResponse.json(await replaceCeLeads(parsed, file.name, admin.username));
  } catch (error) {
    console.error("CE workbook import failed", error);
    return NextResponse.json({ error: "The import failed. The previous CE dataset was left unchanged." }, { status: 500 });
  }
}
