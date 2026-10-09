import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { parseLabourSalesWorkbook } from "@/lib/labour-sales/parse";
import { saveLabourSalesSnapshot } from "@/lib/labour-sales/store";
import { saveRawUploadRows } from "@/lib/raw-upload-rows/store";

/**
 * Labour Sales Report upload — see db/schema.sql's comment on
 * labour_sales_snapshots and labour-sales/parse.ts's module doc comment.
 * Not wired into any dashboard figure yet; local/dev only.
 *
 * Unlike the other six report types' upload routes, there is no `date`
 * field at all: every row's own "Doc. Date" decides which day it belongs
 * to, and a single upload can touch many days (expected for a cumulative
 * backfill). A re-upload overwrites whichever dates it contains — no
 * once-per-day lock, no duplicate-file rejection (confirmed with the user:
 * the same cumulative export may legitimately be re-pulled during backfill,
 * so "identical to a prior upload" isn't evidence of a mistake here).
 */
export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (admin.role !== "branch") {
    return NextResponse.json({ error: "Only a branch account can upload a Labour Sales Report." }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Could not read the uploaded file." }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseLabourSalesWorkbook(buffer);
  } catch (err) {
    return NextResponse.json(
      { error: `Could not parse this file: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 422 }
    );
  }

  if (parsed.days.length === 0) {
    return NextResponse.json({ error: "No row in this file had a readable Doc. Date — check the file and try again." }, { status: 422 });
  }

  const uploadedAt = new Date().toISOString();
  const dbClient = await pool.connect();
  try {
    await dbClient.query("begin");
    for (const day of parsed.days) {
      await saveLabourSalesSnapshot(
        { date: day.date, branch: admin.branch, uploadedAt, sourceFileName: file.name, counts: day.counts, uploadedBy: admin.username },
        dbClient
      );
      await saveRawUploadRows(
        {
          reportType: "labour_sales",
          date: day.date,
          uploadedAt,
          sourceFileName: file.name,
          rows: day.rawRows.map((data) => ({ branch: admin.branch, data })),
          uploadedBy: admin.username,
        },
        dbClient
      );
    }
    await dbClient.query("commit");
  } catch {
    await dbClient.query("rollback");
    return NextResponse.json({ error: "Failed to save upload — please try again." }, { status: 500 });
  } finally {
    dbClient.release();
  }

  const totals = parsed.days.reduce(
    (acc, d) => ({
      rowCount: acc.rowCount + d.counts.rowCount,
      totalLabourBefore: acc.totalLabourBefore + d.counts.totalLabourBefore,
      totalLabourAfter: acc.totalLabourAfter + d.counts.totalLabourAfter,
      vasLabourBefore: acc.vasLabourBefore + d.counts.vasLabourBefore,
      vasLabourAfter: acc.vasLabourAfter + d.counts.vasLabourAfter,
    }),
    { rowCount: 0, totalLabourBefore: 0, totalLabourAfter: 0, vasLabourBefore: 0, vasLabourAfter: 0 }
  );

  return NextResponse.json({
    success: true,
    branch: admin.branch,
    dates: parsed.days.map((d) => d.date),
    skippedRowCount: parsed.skippedRowCount,
    totals,
  });
}
