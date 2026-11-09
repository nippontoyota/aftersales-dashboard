import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { REGIONS } from "@/lib/regions";
import { resolveGroupReportRange } from "@/lib/bp-referrals/group-report";
import { buildGroupReportWorkbook } from "@/lib/bp-referrals/group-report-xlsx";

/** Excel download of the "Group Accident Vehicle Referral" report — see
 * group-report-xlsx.ts for the actual workbook. Same role gate and regional
 * branch-scoping as the payout CSV export. */
export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin || (admin.role !== "bp_ho" && admin.role !== "hq" && admin.role !== "regional")) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const { from, to } = resolveGroupReportRange(searchParams.get("from"), searchParams.get("to"));
  const branches = admin.role === "regional" ? [...REGIONS[admin.region]] : undefined;

  const workbook = await buildGroupReportWorkbook({ from, to, branches });
  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bp-referral-group-report-${from}-to-${to}.xlsx"`,
    },
  });
}
