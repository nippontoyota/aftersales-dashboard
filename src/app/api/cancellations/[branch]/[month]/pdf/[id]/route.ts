import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { REGIONS } from "@/lib/regions";
import { getCancellationFileById } from "@/lib/cancellation/store";

/** One specific upload's PDF, by id — a branch-month can have several (see
 * invoice_cancellation_files' 2026-09-23 migration, one row per upload
 * rather than the old one-per-branch-month that silently discarded every
 * earlier round's file). */
export async function GET(_request: Request, { params }: { params: Promise<{ branch: string; month: string; id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { branch, month, id } = await params;
  if (!/^[A-Z0-9]{3,8}$/.test(branch) || !/^\d{4}-\d{2}$/.test(month) || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  if (admin.role === "branch" && branch !== admin.branch) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }
  if (admin.role === "regional" && !(REGIONS[admin.region] as readonly string[]).includes(branch)) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const file = await getCancellationFileById(Number(id), branch, month);
  if (!file) return NextResponse.json({ error: "No report on file for that branch, month, and upload." }, { status: 404 });

  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${file.fileName}"`,
      "Content-Length": String(file.data.length),
    },
  });
}
