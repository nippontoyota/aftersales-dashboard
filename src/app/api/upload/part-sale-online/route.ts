import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { onlineStoreCodeFor } from "@/lib/report";
import { parsePartSaleWorkbook } from "@/lib/part-sale/parse";
import { loadPartSaleSnapshot, savePartSaleSnapshot } from "@/lib/part-sale/store";
import { saveRawUploadRows } from "@/lib/raw-upload-rows/store";

/** A parent branch's own online-store Part Sale Report (e.g. CO01A filing
 * CO01C's), attributed to the online-store code server-side via
 * onlineStoreCodeFor(admin.branch) — never trusts the client to supply a
 * branch. Optional: an online store doesn't transact every day, so there's
 * no "already uploaded" nag on days it has nothing to file, and no
 * pending-uploads tracking (see admin-store.ts / pending-uploads.ts, which
 * never list the online code at all). Its figures fold into the parent
 * branch's own MTD totals — see report.ts's buildReport(). */
export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (admin.role !== "branch") {
    return NextResponse.json({ error: "Only a branch account can upload a Part Sale Report." }, { status: 403 });
  }

  const onlineBranch = onlineStoreCodeFor(admin.branch);
  if (!onlineBranch) {
    return NextResponse.json({ error: "Your branch doesn't have an online store." }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const date = String(formData.get("date") ?? "").trim();

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Choose a valid date for this upload." }, { status: 400 });
  }

  if (await loadPartSaleSnapshot(date, onlineBranch)) {
    return NextResponse.json(
      { error: `Already uploaded for ${date} — contact HQ (Upload Sheet) if this needs correcting.` },
      { status: 409 }
    );
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Could not read the uploaded file." }, { status: 400 });
  }

  let counts, rawRows;
  try {
    ({ counts, rawRows } = parsePartSaleWorkbook(buffer));
  } catch (err) {
    return NextResponse.json(
      { error: `Could not parse this file: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 422 }
    );
  }

  const uploadedAt = new Date().toISOString();
  await savePartSaleSnapshot({
    date,
    branch: onlineBranch,
    uploadedAt,
    sourceFileName: file.name,
    counts,
  });
  await saveRawUploadRows({
    reportType: "part_sale",
    date,
    uploadedAt,
    sourceFileName: file.name,
    rows: rawRows.map((data) => ({ branch: onlineBranch, data })),
  });

  return NextResponse.json({ success: true, date, branch: onlineBranch, counts });
}
