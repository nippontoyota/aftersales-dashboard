// One-time backfill: recompute part_sale_snapshots.external_sales from the
// stored raw rows after the External Sales filter gained the 12 A-9D1xx DIY
// detailing SKUs (2026-09-04). Only snapshots that actually have raw rows
// on file are recomputed — the pre-2026-09-01 uploads without raw_upload_rows
// are left exactly as they were (nothing to recompute them from).
//
// Corrupted historical CSV rows (a stray `"` in a part name shifted their
// columns before the parser was fixed) can't be recovered here — the
// original file bytes weren't kept. Those rows contribute whatever landed in
// storage; re-upload the affected day to fix them.
//
// Dry-run by default; pass --commit to write.
//
// Keep the filter below in sync with src/lib/part-sale/parse.ts.
import { Client } from "pg";
import "../scripts/load-env.mjs";

const COMMIT = process.argv.includes("--commit");

const EXTERNAL_SALES_BILL_PREFIX = "AA";
const EXTERNAL_SALES_PART_PREFIXES = ["D", "L", "Z", "B", "T"];
const EXTERNAL_SALES_EXACT_PARTS = new Set([
  "A-9ADB1-01001",
  "A-9D101-00001", "A-9D102-00002", "A-9D103-00003", "A-9D104-00004",
  "A-9D105-00005", "A-9D106-00006", "A-9D107-00007", "A-9D108-00008",
  "A-9D109-00009", "A-9D110-00010", "A-9D111-00011", "A-9D112-00012",
]);

const norm = (v) => String(v ?? "").trim();
const toQty = (v) => {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};
const isExternalSalesRow = (billNo, partNo) => {
  if (!billNo.startsWith(EXTERNAL_SALES_BILL_PREFIX)) return false;
  if (EXTERNAL_SALES_EXACT_PARTS.has(partNo)) return true;
  return EXTERNAL_SALES_PART_PREFIXES.includes(partNo[0]);
};

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows: raw } = await client.query(
    `select date::text as date, branch, row_data->>'BillNo' as bill, row_data->>'PartNo' as part, row_data->>'NetAmnt' as net
     from raw_upload_rows where report_type = 'part_sale'`
  );

  // (date,branch) -> recomputed external_sales, over every (date,branch) that has raw rows
  const recomputed = new Map();
  for (const r of raw) {
    const key = `${r.date}|${r.branch}`;
    if (!recomputed.has(key)) recomputed.set(key, 0);
    if (isExternalSalesRow(norm(r.bill), norm(r.part))) {
      recomputed.set(key, recomputed.get(key) + toQty(r.net));
    }
  }

  const { rows: snaps } = await client.query(
    `select date::text as date, branch, external_sales from part_sale_snapshots order by date, branch`
  );

  let changed = 0;
  let skippedNoRaw = 0;
  for (const s of snaps) {
    const key = `${s.date}|${s.branch}`;
    if (!recomputed.has(key)) { skippedNoRaw++; continue; }
    const cur = Number(s.external_sales);
    const next = Math.round(recomputed.get(key) * 100) / 100;
    if (Math.abs(cur - next) < 0.005) continue;
    changed++;
    const d = next - cur;
    console.log(`${s.date} ${s.branch}  ${cur.toFixed(2)}  ->  ${next.toFixed(2)}   (${d >= 0 ? "+" : ""}${d.toFixed(2)})`);
    if (COMMIT) {
      await client.query(
        `update part_sale_snapshots set external_sales = $1 where date = $2 and branch = $3`,
        [next, s.date, s.branch]
      );
    }
  }

  console.log(
    `\n${changed} snapshot row(s) ${COMMIT ? "updated" : "would change"}; ` +
      `${skippedNoRaw} left untouched (no raw rows on file).`
  );
  if (!COMMIT) console.log("Dry run — re-run with --commit to apply.");
} finally {
  await client.end();
}
