// One-time correction on top of the 2026-09-01 backfill-date-shift: Aug 31's
// upload should represent the last real working day before it, but Aug 30
// (Sunday) has no business data — so every row that landed on Aug 30 from
// the first shift needs to move one further day back to Aug 29 (Saturday,
// a real working day). Confirmed with the user 2026-09-01: no upload was
// ever dated Aug 27 (the only other candidate near the Aug 26 holiday), so
// that case doesn't apply — this is the only row group affected.
//
// Usage:
//   node scripts/sunday-date-correction.mjs --backup
//   node scripts/sunday-date-correction.mjs --apply
import { Client } from "pg";
import { writeFileSync } from "node:fs";
import "./load-env.mjs";

const args = process.argv.slice(2);
const mode = args.includes("--apply") ? "apply" : args.includes("--backup") ? "backup" : null;
if (!mode) {
  console.error("Usage: node scripts/sunday-date-correction.mjs --backup | --apply");
  process.exit(1);
}

const TABLES = ["ba_tool_snapshots", "service_info_snapshots", "part_sale_snapshots", "ssrv089_snapshots", "scom205_snapshots", "dashboard_publish_log"];

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  if (mode === "backup") {
    const backup = {};
    for (const t of TABLES) {
      const { rows } = await client.query(`select * from ${t} where date = '2026-08-30'`);
      backup[t] = rows;
    }
    const path = `C:/Users/Nippon/AppData/Local/Temp/claude/D--aftersales-intelligence-dashboard/5fcb6b65-46dd-4d52-a00e-277b05377d5c/scratchpad/db-backup-before-sunday-correction-${Date.now()}.json`;
    writeFileSync(path, JSON.stringify(backup, null, 2));
    console.log(`Backed up ${Object.values(backup).reduce((n, r) => n + r.length, 0)} rows (all Aug 30 rows) to ${path}`);
  }

  if (mode === "apply") {
    await client.query("begin");
    try {
      for (const t of TABLES) {
        const res = await client.query(`update ${t} set date = '2026-08-29' where date = '2026-08-30'`);
        console.log(`${t}: moved ${res.rowCount} rows from Aug 30 to Aug 29`);
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
