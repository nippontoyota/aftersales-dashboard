import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { loadBillsForMonth, loadBillTotalsByMonth, type BillBranchScope } from "@/lib/bill/store";
import { REGIONS } from "@/lib/regions";

export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");
  const branch: BillBranchScope =
    admin.role === "branch" ? admin.branch : admin.role === "regional" ? REGIONS[admin.region] : undefined;

  if (month) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: "Invalid month format — use YYYY-MM." }, { status: 400 });
    }
    const bills = await loadBillsForMonth(month, branch);
    return NextResponse.json({ bills });
  }

  const totals = await loadBillTotalsByMonth(branch);
  return NextResponse.json({ totals });
}
