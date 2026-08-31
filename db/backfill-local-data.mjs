// One-off: migrates whatever's left in data/uploads/*.json (old file-based
// BA Tool snapshots) into ba_tool_snapshots. Run with: node db/backfill-local-data.mjs
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import "../scripts/load-env.mjs";

const NUMERIC_KEYS = [
  "pm", "pmTarget", "bpus", "bpusTarget", "sprInternal", "sprInternalTarget",
  "spoDealer", "spoDealerTarget", "spoTGloss", "spoTGlossTarget", "cpus", "gus",
  "tyreActual", "tyreTarget", "batteryActuals", "batteryTarget", "servicePenetration",
];
const COLUMN_NAME = {
  pm: "pm", pmTarget: "pm_target", bpus: "bpus", bpusTarget: "bpus_target",
  sprInternal: "spr_internal", sprInternalTarget: "spr_internal_target",
  spoDealer: "spo_dealer", spoDealerTarget: "spo_dealer_target",
  spoTGloss: "spo_tgloss", spoTGlossTarget: "spo_tgloss_target",
  cpus: "cpus", gus: "gus", tyreActual: "tyre_actual", tyreTarget: "tyre_target",
  batteryActuals: "battery_actuals", batteryTarget: "battery_target",
  servicePenetration: "service_penetration",
};

const uploadsDir = path.join(process.cwd(), "data", "uploads");
let files;
try {
  files = (await readdir(uploadsDir)).filter((f) => f.endsWith(".json"));
} catch {
  console.log("No data/uploads directory found — nothing to backfill.");
  process.exit(0);
}

if (files.length === 0) {
  console.log("No local BA Tool snapshots found — nothing to backfill.");
  process.exit(0);
}

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  for (const file of files) {
    const snapshot = JSON.parse(await readFile(path.join(uploadsDir, file), "utf-8"));
    await client.query("begin");
    await client.query("delete from ba_tool_snapshots where date = $1", [snapshot.date]);
    for (const row of snapshot.branches) {
      const columns = ["date", "branch", "uploaded_at", "source_file_name", ...NUMERIC_KEYS.map((k) => COLUMN_NAME[k])];
      const values = [
        snapshot.date,
        row.branch,
        snapshot.uploadedAt,
        snapshot.sourceFileName,
        ...NUMERIC_KEYS.map((k) => (typeof row[k] === "number" ? row[k] : null)),
      ];
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
      await client.query(`insert into ba_tool_snapshots (${columns.join(", ")}) values (${placeholders})`, values);
    }
    await client.query("commit");
    console.log(`Migrated ${snapshot.date}: ${snapshot.branches.length} branch rows.`);
  }
} catch (err) {
  await client.query("rollback");
  throw err;
} finally {
  await client.end();
}
