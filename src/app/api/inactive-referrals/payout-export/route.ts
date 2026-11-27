import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { loadPayoutLedger } from "@/lib/inactive-referrals/store";

function csvCell(value: string | number | null): string {
  const s = value === null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV export of the 3C Referrals payout ledger — HQ's own download, for
 * feeding into payroll/accounts separately. Mirrors bp-referrals/
 * payout-export's route exactly. */
export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== "hq") {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const ledger = await loadPayoutLedger();
  const header = [
    "Employee ID",
    "Employee Name",
    "Branch",
    "Validated (₹50 each)",
    "Verified (₹200 each)",
    "Earned (₹)",
    "Already Paid (₹)",
    "Outstanding (₹)",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const row of ledger) {
    lines.push(
      [
        csvCell(row.employeeId),
        csvCell(row.employeeName),
        csvCell(row.employeeBranch),
        csvCell(row.validatedCount),
        csvCell(row.completedCount),
        csvCell(row.amountEarned),
        csvCell(row.amountPaid),
        csvCell(row.amountOwed),
      ].join(","),
    );
  }
  const csv = lines.join("\r\n");
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="3c-referral-payouts-${date}.csv"`,
    },
  });
}
