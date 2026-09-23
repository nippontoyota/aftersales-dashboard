// Audit: for every branch/date in September, find FK rows whose RefDocNo
// points to a bill from a DIFFERENT month, and verify the current snapshot
// already counts them (under the new alwaysEligible rule).
//
//   npx tsx scripts/audit-cross-month-fk-september.mts
import "./load-env.mjs";
import { pool } from "../src/lib/db";
import { partSaleCountsFromRows, alwaysEligible } from "../src/lib/part-sale/parse";

// 1. Get all September branch/dates that have FK rows
const { rows: fkDates } = await pool.query<{ branch: string; date: string }>(`
  SELECT DISTINCT branch, date::text as date
  FROM raw_upload_rows
  WHERE report_type = 'part_sale'
    AND date >= '2026-09-01' AND date <= '2026-09-30'
    AND row_data->>'BillNo' LIKE 'F%'
  ORDER BY branch, date
`);

console.log(`Found ${fkDates.length} branch/dates with FK rows in September.\n`);

type Issue = {
  branch: string;
  date: string;
  fkBill: string;
  refDoc: string;
  refDocMonth: string | null;
  netAmnt: number;
  snapshotValue: number;
  recomputedValue: number;
  mismatch: boolean;
};

const issues: Issue[] = [];
const crossMonthEntries: { branch: string; date: string; fkBill: string; refDoc: string; refDocMonth: string | null; netAmnt: number }[] = [];

for (const { branch, date } of fkDates) {
  // Get all rows for this branch/date
  const { rows: raw } = await pool.query<{ row_data: Record<string, unknown> }>(
    `SELECT row_data FROM raw_upload_rows
      WHERE report_type = 'part_sale' AND branch = $1 AND date = $2
      ORDER BY row_index`,
    [branch, date]
  );
  const rawRows = raw.map(r => r.row_data);

  // Find FK rows with cross-month RefDocNos
  const fkRows = rawRows.filter(r => String(r["BillNo"] ?? "").charAt(0).toUpperCase() === "F");
  const refDocNos = [...new Set(fkRows.map(r => String(r["RefDocNo"] ?? "").trim()).filter(Boolean))];

  if (refDocNos.length === 0) continue;

  // Look up original bill dates
  const { rows: origBills } = await pool.query<{ bill_no: string; first_date: string }>(
    `SELECT row_data->>'BillNo' as bill_no, min(date::text) as first_date
       FROM raw_upload_rows
      WHERE report_type = 'part_sale' AND branch = $1
        AND row_data->>'BillNo' = ANY($2::text[])
      GROUP BY row_data->>'BillNo'`,
    [branch, refDocNos]
  );

  const billDateMap = new Map(origBills.map(b => [b.bill_no, b.first_date]));

  // Find cross-month FK rows (refDoc from before Sep 2026)
  const hasCrossMonth = fkRows.some(r => {
    const refDoc = String(r["RefDocNo"] ?? "").trim();
    const refDate = billDateMap.get(refDoc);
    return refDate && !refDate.startsWith("2026-09");
  });

  if (!hasCrossMonth) continue;

  // Recompute with alwaysEligible
  const recomputed = partSaleCountsFromRows(rawRows, alwaysEligible);

  // Get current snapshot
  const { rows: snap } = await pool.query<{ external_sales: string }>(
    `SELECT external_sales FROM part_sale_snapshots WHERE branch = $1 AND date = $2`,
    [branch, date]
  );
  const snapshotValue = snap[0] ? Number(snap[0].external_sales) : NaN;
  const recomputedValue = recomputed.externalSales;
  const mismatch = Math.abs(snapshotValue - recomputedValue) > 0.01;

  // Log cross-month FK details
  for (const r of fkRows) {
    const refDoc = String(r["RefDocNo"] ?? "").trim();
    const refDate = billDateMap.get(refDoc);
    if (refDate && !refDate.startsWith("2026-09")) {
      crossMonthEntries.push({
        branch, date,
        fkBill: String(r["BillNo"] ?? ""),
        refDoc,
        refDocMonth: refDate?.slice(0, 7) ?? null,
        netAmnt: Number(r["NetAmnt"] ?? 0),
      });
    }
  }

  if (mismatch) {
    issues.push({ branch, date, fkBill: "", refDoc: "", refDocMonth: null, netAmnt: 0, snapshotValue, recomputedValue, mismatch });
  }
}

console.log("=== Cross-month FK rows found in September ===");
if (crossMonthEntries.length === 0) {
  console.log("  None found.");
} else {
  for (const e of crossMonthEntries) {
    console.log(`  ${e.branch} ${e.date}  ${e.fkBill} → ${e.refDoc} (orig month: ${e.refDocMonth})  Net: ${e.netAmnt}`);
  }
}

console.log("\n=== Snapshot mismatches (snapshot ≠ alwaysEligible recompute) ===");
if (issues.length === 0) {
  console.log("  None — all snapshots are up to date. ✓");
} else {
  for (const i of issues) {
    console.log(`  ${i.branch} ${i.date}  snapshot=${i.snapshotValue.toFixed(2)}  recomputed=${i.recomputedValue.toFixed(2)}  diff=${(i.recomputedValue - i.snapshotValue).toFixed(2)}`);
  }
}

await pool.end();
