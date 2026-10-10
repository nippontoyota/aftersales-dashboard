// Applies db/schema.sql to DATABASE_URL — run with `node scripts/apply-schema.mjs`.
// Safe to re-run: every statement in schema.sql is idempotent (`create table
// if not exists`, `add column if not exists`, `drop constraint if exists` +
// re-add, etc.), so this is how schema changes actually reach the database —
// edit db/schema.sql, then re-run this against the real connection.
import { readFileSync } from "node:fs";
import { Client } from "pg";
import "./load-env.mjs";

const sql = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf-8");

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  console.log("db/schema.sql applied successfully.");
} finally {
  await client.end();
}
