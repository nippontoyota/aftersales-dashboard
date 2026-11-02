import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { loadPayoutLedger } from "@/lib/bp-referrals/store";
import { REGIONS } from "@/lib/regions";

function csvCell(value: string | number | null): string {
  const s = value === null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV export of the BP referral payout ledger — BP HO's own download, for
 * feeding into payroll/accounts separately. Same role gate as the BP HO
 * analytics page itself (see bp-referrals/page.tsx), plus a regional
 * manager's own scoped export (2026-10-29, the user's request) — their
 * region's branches only, same filter the page itself uses. */
export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin || (admin.role !== "bp_ho" && admin.role !== "hq" && admin.role !== "regional")) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const ledger = await loadPayoutLedger(admin.role === "regional" ? [...REGIONS[admin.region]] : undefined);
  const header = ["Employee ID", "Employee Name", "Branch", "Validated (₹50 each)", "Completed (₹200 each)", "Total Owed (₹)"];
  const lines = [header.map(csvCell).join(",")];
  for (const row of ledger) {
    lines.push(
      [
        csvCell(row.employeeId),
        csvCell(row.employeeName),
        csvCell(row.employeeBranch),
        csvCell(row.validatedCount),
        csvCell(row.completedCount),
        csvCell(row.amountOwed),
      ].join(","),
    );
  }
  const csv = lines.join("\r\n");
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bp-referral-payouts-${date}.csv"`,
    },
  });
}
