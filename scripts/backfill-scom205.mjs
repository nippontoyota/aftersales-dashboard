// Re-derive a branch's scom205 (Cost & Sales / Monthly KPI) GUS/BPU Parts &
// Labour MTD from the raw rows already on file — for when the parser was
// reading the wrong column group.
//
// Mirrors src/lib/scom205/parse.ts's scom205TotalsFromRows(): locate the
// [Units, Lab Rev, SP Rev] column groups from the sub-header row, read the
// "Total" group first, fall back to the branch-specific group when Total is
// blank. Raw rows are never touched.
//
//   node scripts/backfill-scom205.mjs <BRANCH> [YYYY-MM-DD] [--commit]
//
// <BRANCH>      branch code, e.g. TR01B
// [YYYY-MM-DD]  only snapshots on/after this date (default 2026-09-01)
// --commit      apply; without it, dry run
//
// History: first run for TR01B 2026-09-08 — its export changed format around
// 2026-09-03 and stopped filling the "Total" columns, silently saving zeros.
import { Client } from "pg";
import "./load-env.mjs";

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");
const positional = args.filter((a) => !a.startsWith("--"));
const BRANCH = positional[0];
const FROM = positional[1] || "2026-09-01";

if (!BRANCH || !/^[A-Z]{2}\d{2}[A-Z]$/.test(BRANCH)) {
  console.error("Usage: node scripts/backfill-scom205.mjs <BRANCH> [YYYY-MM-DD] [--commit]");
  process.exit(1);
}

const GUS_TOTAL_LABEL = "Total General Units Serviced";
const BPU_TOTAL_LABEL = "Total Body & Paint Units Serviced";
const HEADER_SEARCH_ROWS = 12;

const cell = (v) => String(v ?? "");
const isUnits = (v) => /units\s*\(nos\)/i.test(cell(v));
const isLabRev = (v) => /lab\s*rev/i.test(cell(v));
const isSpRev = (v) => /sp\s*rev/i.test(cell(v));

function findRowByLabel(rows, label) {
  return rows.find((r) => cell(r[0]).trim() === label) ?? null;
}

function findColumnGroups(rows) {
  let sub = -1;
  for (let i = 0; i < Math.min(rows.length, HEADER_SEARCH_ROWS); i++) {
    const r = rows[i];
    if (r.some(isUnits) && r.some(isLabRev) && r.some(isSpRev)) { sub = i; break; }
  }
  if (sub === -1) return null;

  const starts = [];
  rows[sub].forEach((c, idx) => { if (isUnits(c)) starts.push(idx); });
  if (starts.length === 0) return null;

  let totalCol = -1;
  for (let i = sub; i >= Math.max(0, sub - 3); i--) {
    const c = rows[i].findIndex((x) => cell(x).trim() === "Total");
    if (c !== -1) { totalCol = c; break; }
  }

  const ordered = [...starts].sort((a, b) => {
    if (totalCol !== -1 && a === totalCol) return -1;
    if (totalCol !== -1 && b === totalCol) return 1;
    return a - b;
  });
  return ordered.map((s) => ({ units: s, lab: s + 1, sp: s + 2 }));
}

function readAmount(row, groups, field) {
  for (const g of groups) {
    const raw = cell(row[g[field]]).replace(/,/g, "").trim();
    if (raw === "") continue;
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function totalsFromRows(rows) {
  const gusRow = findRowByLabel(rows, GUS_TOTAL_LABEL);
  const bpuRow = findRowByLabel(rows, BPU_TOTAL_LABEL);
  if (!gusRow || !bpuRow) throw new Error("missing GUS/BPU total rows");
  const groups = findColumnGroups(rows);
  if (!groups) throw new Error("missing revenue column headers");
  return {
    gusSpRevMtd: readAmount(gusRow, groups, "sp"),
    gusLabRevMtd: readAmount(gusRow, groups, "lab"),
    bpuSpRevMtd: readAmount(bpuRow, groups, "sp"),
    bpuLabRevMtd: readAmount(bpuRow, groups, "lab"),
  };
}

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows: snapshots } = await client.query(
    `select date::text as date, source_file_name,
            gus_sp_rev_mtd, gus_lab_rev_mtd, bpu_sp_rev_mtd, bpu_lab_rev_mtd
       from scom205_snapshots
      where branch = $1 and date >= $2
      order by date`,
    [BRANCH, FROM],
  );
  if (snapshots.length === 0) {
    console.log(`No scom205 snapshots for ${BRANCH} on/after ${FROM}.`);
    process.exit(0);
  }

  const updates = [];
  for (const snap of snapshots) {
    const { rows: raw } = await client.query(
      "select row_data from raw_upload_rows where report_type = 'scom205' and branch = $1 and date = $2 order by row_index",
      [BRANCH, snap.date],
    );
    if (raw.length === 0) {
      console.log(`${snap.date}  — no raw rows on file, skipping`);
      continue;
    }

    const fixed = totalsFromRows(raw.map((r) => r.row_data));
    const now = {
      gusSpRevMtd: Number(snap.gus_sp_rev_mtd),
      gusLabRevMtd: Number(snap.gus_lab_rev_mtd),
      bpuSpRevMtd: Number(snap.bpu_sp_rev_mtd),
      bpuLabRevMtd: Number(snap.bpu_lab_rev_mtd),
    };
    const changed = ["gusSpRevMtd", "gusLabRevMtd", "bpuSpRevMtd", "bpuLabRevMtd"].some(
      (k) => now[k].toFixed(2) !== fixed[k].toFixed(2),
    );
    console.log(
      `${snap.date}  (${raw.length} rows)  ${snap.source_file_name}\n` +
        `   GUS SP  ${now.gusSpRevMtd.toFixed(2)} -> ${fixed.gusSpRevMtd.toFixed(2)}` +
        `   GUS Lab ${now.gusLabRevMtd.toFixed(2)} -> ${fixed.gusLabRevMtd.toFixed(2)}\n` +
        `   BPU SP  ${now.bpuSpRevMtd.toFixed(2)} -> ${fixed.bpuSpRevMtd.toFixed(2)}` +
        `   BPU Lab ${now.bpuLabRevMtd.toFixed(2)} -> ${fixed.bpuLabRevMtd.toFixed(2)}` +
        (changed ? "   *" : ""),
    );
    if (changed) updates.push({ date: snap.date, fixed });
  }

  console.log(`\n${updates.length} snapshot(s) to update: ${updates.map((u) => u.date).join(", ") || "none"}`);
  if (!COMMIT) {
    console.log("Dry run — re-run with --commit to apply.");
    process.exit(0);
  }
  if (updates.length === 0) {
    console.log("Nothing to update.");
    process.exit(0);
  }

  const uploadedAt = new Date().toISOString();
  await client.query("begin");
  for (const u of updates) {
    await client.query(
      `update scom205_snapshots
          set gus_sp_rev_mtd = $3, gus_lab_rev_mtd = $4, bpu_sp_rev_mtd = $5, bpu_lab_rev_mtd = $6, uploaded_at = $7
        where branch = $1 and date = $2`,
      [BRANCH, u.date, u.fixed.gusSpRevMtd, u.fixed.gusLabRevMtd, u.fixed.bpuSpRevMtd, u.fixed.bpuLabRevMtd, uploadedAt],
    );
  }
  await client.query("commit");
  console.log(`\nCommitted. ${updates.length} snapshot(s) updated.`);
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}
