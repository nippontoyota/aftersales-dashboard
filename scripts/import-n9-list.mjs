import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import "./load-env.mjs";
import { parseN9List } from "../src/lib/ce/n9.mjs";
import { applyN9Batch } from "./n9-apply.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const positional = args.filter((arg) => arg !== "--apply");
if (positional.length !== 1 || args.some((arg) => arg.startsWith("--") && arg !== "--apply")) {
  throw new Error("Usage: node scripts/import-n9-list.mjs <n9-file.csv> [--apply]");
}

const sourcePath = path.resolve(positional[0]);
const buffer = readFileSync(sourcePath);
const sha256 = createHash("sha256").update(buffer).digest("hex");
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const parsed = parseN9List(buffer, today);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const result = await applyN9Batch({ client, parsed, sourceFileName: path.basename(sourcePath), sha256, apply });
  if (result.noop) {
    console.log(`N-9 import: no-op (this file is already audited as import ${result.priorImportId}).`);
  } else {
    console.log(`N-9 import: ${apply ? "applied" : "dry run"}`);
    console.log(result);
    if (!apply) console.log("No changes committed. Re-run with --apply after reviewing these aggregates.");
  }
} finally {
  await client.end();
}
