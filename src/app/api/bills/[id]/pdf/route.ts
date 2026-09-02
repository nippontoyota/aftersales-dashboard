import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { getBillById } from "@/lib/bill/store";
import { getBillPdfSignedUrl } from "@/lib/supabase-storage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await params;
  const billId = parseInt(id, 10);
  if (isNaN(billId)) {
    return NextResponse.json({ error: "Invalid bill ID." }, { status: 400 });
  }

  const bill = await getBillById(billId);
  if (!bill) {
    return NextResponse.json({ error: "Bill not found." }, { status: 404 });
  }

  if (admin.role === "branch" && bill.branch !== admin.branch) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const signedUrl = await getBillPdfSignedUrl(bill.storagePath);
  return NextResponse.redirect(signedUrl);
}
