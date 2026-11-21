import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getCurrentAdmin } from "@/lib/auth";
import { loadModelWiseReport } from "@/lib/model-wise/load";
import { VEHICLE_BRANDS, type VehicleBrand } from "@/lib/model-wise/brand";
import type { ModelWiseBranchResult } from "@/lib/model-wise/compute";
import { modelWiseScopeBranches } from "@/app/model-wise/model-wise-guard";

/**
 * Model-wise Toyota/Alliance/Lexus revenue split — Excel download. Same
 * sheet shape as the user's own manually-built "Toyota-Alliance-Lexus
 * Revenue Split" workbook (Summary / Branch-wise GUS / Branch-wise BP),
 * extended with the two sections added to the dashboard view that aren't in
 * their original file (TGLOSS revenue, Injector Cleaner/Engine Flush/Tyre/
 * Battery) as their own sheets.
 */

const BRAND_LABEL: Record<VehicleBrand, string> = { toyota: "Toyota", alliance: "Alliance", lexus: "Lexus" };

function cr(value: number): number {
  return Math.round((value / 1_00_00_000) * 100) / 100;
}
function whole(value: number): number {
  return Math.round(value);
}

function summarySection(title: string, byBrand: Record<VehicleBrand, { ros: number; parts: number; labour: number }>, totalLabel: string): (string | number)[][] {
  const rows: (string | number)[][] = [[title], ["Brand", "ROs", "Parts (Cr)", "Labour (Cr)", "Parts/car (Rs)", "Labour/car (Rs)"]];
  let totalRos = 0,
    totalParts = 0,
    totalLabour = 0;
  for (const brand of VEHICLE_BRANDS) {
    const f = byBrand[brand];
    totalRos += f.ros;
    totalParts += f.parts;
    totalLabour += f.labour;
    rows.push([BRAND_LABEL[brand], f.ros, cr(f.parts), cr(f.labour), f.ros > 0 ? whole(f.parts / f.ros) : "", f.ros > 0 ? whole(f.labour / f.ros) : ""]);
  }
  rows.push([totalLabel, totalRos, cr(totalParts), cr(totalLabour), totalRos > 0 ? whole(totalParts / totalRos) : "", totalRos > 0 ? whole(totalLabour / totalRos) : ""]);
  rows.push([]);
  rows.push([]);
  return rows;
}

function branchWiseSheet(
  title: string,
  subtitle: string,
  branches: ModelWiseBranchResult[],
  ros: (b: ModelWiseBranchResult) => Record<VehicleBrand, number>,
  figures: (b: ModelWiseBranchResult) => Record<VehicleBrand, { parts: number; labour: number }>,
  companyRos: Record<VehicleBrand, number>,
  companyFigures: Record<VehicleBrand, { parts: number; labour: number }>
): (string | number)[][] {
  const header1: (string | number)[] = ["Branch"];
  const header2: (string | number)[] = [""];
  for (const brand of VEHICLE_BRANDS) {
    header1.push(BRAND_LABEL[brand], "", "", "", "");
    header2.push("ROs", "Parts (Rs)", "Labour (Rs)", "Parts/car (Rs)", "Labour/car (Rs)");
  }
  const rows: (string | number)[][] = [[title], [subtitle], [], header1, header2];

  for (const b of branches) {
    const row: (string | number)[] = [b.branch];
    const branchRos = ros(b);
    const branchFigures = figures(b);
    for (const brand of VEHICLE_BRANDS) {
      const r = branchRos[brand];
      const f = branchFigures[brand];
      if (r === 0 && f.parts === 0 && f.labour === 0) {
        row.push("", "", "", "", "");
      } else {
        row.push(r, whole(f.parts), whole(f.labour), r > 0 ? whole(f.parts / r) : "", r > 0 ? whole(f.labour / r) : "");
      }
    }
    rows.push(row);
  }

  const totalRow: (string | number)[] = ["Company Total"];
  for (const brand of VEHICLE_BRANDS) {
    const r = companyRos[brand];
    const f = companyFigures[brand];
    totalRow.push(r, whole(f.parts), whole(f.labour), r > 0 ? whole(f.parts / r) : "", r > 0 ? whole(f.labour / r) : "");
  }
  rows.push(totalRow);
  return rows;
}

export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin || (admin.role !== "hq" && admin.role !== "vp_service" && admin.role !== "regional" && admin.role !== "branch")) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  if (!date) return NextResponse.json({ error: "Missing date." }, { status: 400 });

  const scopeBranches = modelWiseScopeBranches(admin);
  const report = await loadModelWiseReport(date, scopeBranches ?? undefined);
  if (!report) return NextResponse.json({ error: "No report for this date." }, { status: 404 });

  const combined = (b: ModelWiseBranchResult) => {
    const out = {} as Record<VehicleBrand, { ros: number; parts: number; labour: number }>;
    for (const brand of VEHICLE_BRANDS) {
      out[brand] = { ros: b.gusRos[brand] + b.bpRos[brand], parts: b.gus[brand].parts + b.bp[brand].parts, labour: b.gus[brand].labour + b.bp[brand].labour };
    }
    return out;
  };
  const companyRos = (gus: Record<VehicleBrand, number>, bp: Record<VehicleBrand, number>) => {
    const out = {} as Record<VehicleBrand, number>;
    for (const brand of VEHICLE_BRANDS) out[brand] = gus[brand] + bp[brand];
    return out;
  };
  const companyCombined = (() => {
    const out = {} as Record<VehicleBrand, { ros: number; parts: number; labour: number }>;
    for (const brand of VEHICLE_BRANDS) {
      out[brand] = {
        ros: report.company.gusRos[brand] + report.company.bpRos[brand],
        parts: report.company.gus[brand].parts + report.company.bp[brand].parts,
        labour: report.company.gus[brand].labour + report.company.bp[brand].labour,
      };
    }
    return out;
  })();

  const withRos = (ros: Record<VehicleBrand, number>, figures: Record<VehicleBrand, { parts: number; labour: number }>) => {
    const out = {} as Record<VehicleBrand, { ros: number; parts: number; labour: number }>;
    for (const brand of VEHICLE_BRANDS) out[brand] = { ros: ros[brand], parts: figures[brand].parts, labour: figures[brand].labour };
    return out;
  };

  const workbook = XLSX.utils.book_new();

  // --- Summary sheet ---
  const summaryRows: (string | number)[][] = [
    [`Toyota / Alliance / Lexus Revenue Split — ${date}`],
    [`Data through ${date}. Revenue in Rs Crores, per-vehicle in plain rupees.`],
    [],
    ...summarySection("GUS (General Service)", withRos(report.company.gusRos, report.company.gus), "Official MTD Total"),
    ...summarySection("BP (Body & Paint)", withRos(report.company.bpRos, report.company.bp), "Official MTD Total"),
    ...summarySection("GUS + BP Combined", companyCombined, "Company Total"),
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

  // --- Branch-wise GUS ---
  const gusSheetRows = branchWiseSheet(
    `Branch-wise GUS Revenue by Brand — ${date}`,
    `All figures in full Rs. Data through ${date}.`,
    report.branches,
    (b) => b.gusRos,
    (b) => b.gus,
    report.company.gusRos,
    report.company.gus
  );
  const gusSheet = XLSX.utils.aoa_to_sheet(gusSheetRows);
  gusSheet["!cols"] = [{ wch: 10 }, ...Array(15).fill({ wch: 13 })];
  XLSX.utils.book_append_sheet(workbook, gusSheet, "Branch-wise GUS");

  // --- Branch-wise BP ---
  const bpSheetRows = branchWiseSheet(
    `Branch-wise BP Revenue by Brand — ${date}`,
    `All figures in full Rs. Data through ${date}.`,
    report.branches,
    (b) => b.bpRos,
    (b) => b.bp,
    report.company.bpRos,
    report.company.bp
  );
  const bpSheet = XLSX.utils.aoa_to_sheet(bpSheetRows);
  bpSheet["!cols"] = [{ wch: 10 }, ...Array(15).fill({ wch: 13 })];
  XLSX.utils.book_append_sheet(workbook, bpSheet, "Branch-wise BP");

  // --- Branch-wise Combined ---
  const combinedSheetRows = branchWiseSheet(
    `Branch-wise GUS + BP Combined by Brand — ${date}`,
    `All figures in full Rs. Data through ${date}.`,
    report.branches,
    (b) => companyRos(b.gusRos, b.bpRos),
    (b) => combined(b),
    companyRos(report.company.gusRos, report.company.bpRos),
    companyCombined
  );
  const combinedSheet = XLSX.utils.aoa_to_sheet(combinedSheetRows);
  combinedSheet["!cols"] = [{ wch: 10 }, ...Array(15).fill({ wch: 13 })];
  XLSX.utils.book_append_sheet(workbook, combinedSheet, "Branch-wise Combined");

  // --- TGLOSS ---
  const tglossRows: (string | number)[][] = [
    [`TGLOSS Revenue by Brand — ${date}`],
    [],
    ["Branch", "Toyota (Rs)", "Alliance (Rs)", "Lexus (Rs)"],
    ...report.branches.map((b) => [b.branch, whole(b.tgloss.toyota), whole(b.tgloss.alliance), whole(b.tgloss.lexus)]),
    ["Company Total", whole(report.company.tgloss.toyota), whole(report.company.tgloss.alliance), whole(report.company.tgloss.lexus)],
  ];
  const tglossSheet = XLSX.utils.aoa_to_sheet(tglossRows);
  tglossSheet["!cols"] = [{ wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(workbook, tglossSheet, "TGLOSS");

  // --- Injector Cleaner / Engine Flush / Tyre / Battery ---
  const itemSections: { key: "injectorCleaner" | "engineFlush" | "tyre" | "battery"; title: string }[] = [
    { key: "injectorCleaner", title: "Injector Cleaner" },
    { key: "engineFlush", title: "Engine Flush" },
    { key: "tyre", title: "Tyre" },
    { key: "battery", title: "Battery" },
  ];
  const itemRows: (string | number)[][] = [[`Injector Cleaner / Engine Flush / Tyre / Battery by Brand — ${date}`], []];
  for (const section of itemSections) {
    const countKey = `${section.key}Count` as const;
    const revenueKey = `${section.key}Revenue` as const;
    itemRows.push([section.title]);
    const header: (string | number)[] = ["Branch"];
    for (const brand of VEHICLE_BRANDS) header.push(`${BRAND_LABEL[brand]} Count`, `${BRAND_LABEL[brand]} Revenue (Rs)`);
    itemRows.push(header);
    for (const b of report.branches) {
      const row: (string | number)[] = [b.branch];
      for (const brand of VEHICLE_BRANDS) row.push(b.items[brand][countKey], whole(b.items[brand][revenueKey]));
      itemRows.push(row);
    }
    const totalRow: (string | number)[] = ["Company Total"];
    for (const brand of VEHICLE_BRANDS) totalRow.push(report.company.items[brand][countKey], whole(report.company.items[brand][revenueKey]));
    itemRows.push(totalRow);
    itemRows.push([]);
    itemRows.push([]);
  }
  const itemSheet = XLSX.utils.aoa_to_sheet(itemRows);
  itemSheet["!cols"] = [{ wch: 10 }, ...Array(6).fill({ wch: 15 })];
  XLSX.utils.book_append_sheet(workbook, itemSheet, "Items");

  const buffer: Buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="model-wise-revenue-split-${date}.xlsx"`,
    },
  });
}
