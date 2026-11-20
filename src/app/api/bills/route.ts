import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { loadBillsForMonth, loadBillTotalsByMonth, type BillBranchScope } from "@/lib/bill/store";
import { REGIONS } from "@/lib/regions";
import { KL_BRANCHES } from "@/lib/kl-branches-data";

export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");
  const baseScope: BillBranchScope =
    admin.role === "branch"
      ? admin.branch
      : admin.role === "regional"
        ? REGIONS[admin.region]
        : admin.role === "kl_cluster"
          ? KL_BRANCHES
          : undefined;

  // ?branch= narrows further within the viewer's own scope — ignored for a
  // branch admin (already a single branch) and only honoured when it falls
  // inside the broader scope (a regional manager can't reach outside their
  // region this way).
  const requestedBranch = searchParams.get("branch");
  const branch: BillBranchScope =
    admin.role !== "branch" && requestedBranch && (Array.isArray(baseScope) ? baseScope.includes(requestedBranch) : true)
      ? requestedBranch
      : baseScope;

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
