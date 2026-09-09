// Recompute Service Info "Brake Skimming" from the raw rows already on file,
// after widening isBrakeSkimmingDesc() (src/lib/service-info/parse.ts) from
// front-on-vehicle-only to every axle + off-vehicle disc resurfacing
// (2026-09-09, at the user's request). Rewrites brake_skimming only — the
// other counts and vas_revenue are untouched.
//
// Same per-RO logic as the parser: distinct "Job Order No" among matching
// rows per day (blank Job Order No → per-row token so it still counts once);
// MTD is the sum of the daily counts.
//
//   npx tsx scripts/recompute-service-info-brake-skimming.mts [BRANCH] [--commit]
//
// [BRANCH]   one branch code (default: every branch)
// --commit   apply; without it, dry run
import "./load-env.mjs";
import { isBrakeSkimmingDesc } from "../src/lib/service-info/parse";
import { pool } from "../src/lib/db";

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");
const ONLY = args.find((a) => /^[A-Z]{2}\d{2}[A-Z]$/.test(a)) ?? null;
const FROM = "2026-09-01";
const nz = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

const { rows: snaps } = await pool.query<{ branch: string; date: string; brake_skimming: number }>(
  `select branch, date::text as date, brake_skimming
     from service_info_snapshots
    where date >= $1 ${ONLY ? "and branch = $2" : ""}
    order by branch, date`,
  ONLY ? [FROM, ONLY] : [FROM],
);

type Row = { branch: string; date: string; before: number; after: number };
const changed: Row[] = [];
const mtd = new Map<string, { before: number; after: number }>();

for (const s of snaps) {
  const { rows: raw } = await pool.query<{ row_data: Record<string, unknown> }>(
    `select row_data from raw_upload_rows
      where report_type = 'service_info' and branch = $1 and date = $2 order by row_index`,
    [s.branch, s.date],
  );
  const ros = new Set<string>();
  raw.forEach((r, i) => {
    if (isBrakeSkimmingDesc(nz(r.row_data["Job Desc"]))) ros.add(nz(r.row_data["Job Order No"]) || ` row-${i}`);
  });
  const after = ros.size;
  const before = Number(s.brake_skimming);

  const m = mtd.get(s.branch) ?? { before: 0, after: 0 };
  m.before += before;
  m.after += after;
  mtd.set(s.branch, m);

  if (after !== before) changed.push({ branch: s.branch, date: s.date, before, after });
}

console.log(`\n=== Brake Skimming recompute (from ${FROM}${ONLY ? `, ${ONLY} only` : ""}) ===\n`);
console.log("branch   MTD now   MTD new   Δ    per-day changes");
for (const b of [...mtd.keys()].sort()) {
  const m = mtd.get(b)!;
  const days = changed.filter((c) => c.branch === b).map((c) => `${c.date.slice(5)} ${c.before}→${c.after}`);
  const mark = m.after !== m.before ? "  <--" : "";
  console.log(
    b.padEnd(9),
    String(m.before).padStart(7),
    String(m.after).padStart(9),
    (m.after - m.before >= 0 ? "+" : "") + String(m.after - m.before),
    "   ",
    days.join(" · "),
    mark,
  );
}
const totBefore = [...mtd.values()].reduce((a, v) => a + v.before, 0);
const totAfter = [...mtd.values()].reduce((a, v) => a + v.after, 0);
console.log(`\nGROUP  ${totBefore} → ${totAfter}  (+${totAfter - totBefore})`);
console.log(`${changed.length} snapshot(s) would change.`);

if (!COMMIT) {
  console.log("\nDry run — re-run with --commit to apply.");
  await pool.end();
  process.exit(0);
}

const at = new Date().toISOString();
const client = await pool.connect();
try {
  await client.query("begin");
  for (const c of changed) {
    await client.query(
      "update service_info_snapshots set brake_skimming = $3, uploaded_at = $4 where branch = $1 and date = $2",
      [c.branch, c.date, c.after, at],
    );
  }
  await client.query("commit");
  console.log(`\nCommitted — ${changed.length} snapshot(s) updated.`);
} catch (e) {
  await client.query("rollback").catch(() => {});
  throw e;
} finally {
  client.release();
  await pool.end();
}
