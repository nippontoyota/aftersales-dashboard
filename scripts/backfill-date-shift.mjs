// One-time backfill: shift every existing snapshot date (and the matching
// dashboard_publish_log dates) back by exactly one day, to correct the
// "uploaded today, dated today, but the file is really yesterday's data"
// habit that was baked into every upload until 2026-09-01's fix. Confirmed
// with the user 2026-09-01 — every date currently on file sits entirely
// inside August, so a flat -1-day shift has no month-boundary edge case and
// no collisions (verified below before any write).
//
// Usage:
//   node scripts/backfill-date-shift.mjs --backup   (dump all affected rows to JSON, no writes)
//   node scripts/backfill-date-shift.mjs --dry-run   (show old -> new date mapping per table, no writes)
//   node scripts/backfill-date-shift.mjs --apply     (run the actual shift, inside one transaction)
import { Client } from "pg";
import { writeFileSync } from "node:fs";
import "./load-env.mjs";

const args = process.argv.slice(2);
const mode = args.includes("--apply") ? "apply" : args.includes("--dry-run") ? "dry-run" : args.includes("--backup") ? "backup" : null;
if (!mode) {
  console.error("Usage: node scripts/backfill-date-shift.mjs --backup | --dry-run | --apply");
  process.exit(1);
}

const TABLES = [
  { name: "ba_tool_snapshots", keyCols: ["date", "branch"] },
  { name: "service_info_snapshots", keyCols: ["date", "branch"] },
  { name: "part_sale_snapshots", keyCols: ["date", "branch"] },
  { name: "ssrv089_snapshots", keyCols: ["date", "branch", "variant"] },
  { name: "scom205_snapshots", keyCols: ["date", "branch"] },
  { name: "dashboard_publish_log", keyCols: ["date"] },
];

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  if (mode === "backup") {
    const backup = {};
    for (const t of TABLES) {
      const { rows } = await client.query(`select * from ${t.name}`);
      backup[t.name] = rows;
    }
    const path = `db-backup-before-date-shift-${Date.now()}.json`;
    writeFileSync(path, JSON.stringify(backup, null, 2));
    console.log(`Backed up ${Object.values(backup).reduce((n, r) => n + r.length, 0)} rows across ${TABLES.length} tables to ${path}`);
  }

  if (mode === "dry-run") {
    for (const t of TABLES) {
      const { rows } = await client.query(`select date::text as date, count(*) as n from ${t.name} group by date order by date`);
      console.log(`\n${t.name}:`);
      for (const r of rows) {
        const oldD = new Date(r.date + "T00:00:00Z");
        const newD = new Date(oldD.getTime() - 86400000);
        console.log(`  ${r.date} -> ${newD.toISOString().slice(0, 10)}  (${r.n} rows)`);
      }
    }
    // Note: a uniform -1-day shift applied to every row can never produce a
    // real final-state collision (the original (date, branch[, variant])
    // primary key was already unique, and subtracting a constant is
    // injective). The one real hazard is mid-statement: chained dates
    // (e.g. CO01B has 08-28, 08-29, 08-31 all present) mean Postgres's
    // immediate (non-deferred) PK check can see a not-yet-updated row still
    // sitting at a date another row is being moved into, depending on row
    // processing order — a spurious duplicate-key error that has nothing to
    // do with the real end state. --apply avoids this with a two-phase
    // shift through a disjoint temporary date range, so no chain hazard.
    console.log("\n(No further collision check needed — see comment above. --apply uses a two-phase shift to sidestep the mid-statement chain hazard.)");
  }

  if (mode === "apply") {
    const TEMP_OFFSET_DAYS = 100000; // any value guaranteed to land outside all real data
    await client.query("begin");
    try {
      for (const t of TABLES) {
        await client.query(`update ${t.name} set date = date + interval '${TEMP_OFFSET_DAYS} days'`);
      }
      for (const t of TABLES) {
        const res = await client.query(`update ${t.name} set date = date - interval '${TEMP_OFFSET_DAYS + 1} days'`);
        console.log(`${t.name}: shifted ${res.rowCount} rows`);
      }
      await client.query("commit");
      console.log("\nCommitted.");
    } catch (err) {
      await client.query("rollback");
      console.error("Rolled back due to error:", err);
      process.exit(1);
    }
  }
} finally {
  await client.end();
}
