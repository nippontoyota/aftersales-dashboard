// Applies db/schema.sql to DATABASE_URL. Safe to re-run — every statement
// is `create table if not exists`. Run with: node db/migrate.mjs
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import "../scripts/load-env.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(path.join(dir, "schema.sql"), "utf-8");

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  console.log("Schema applied successfully.");
} finally {
  await client.end();
}
