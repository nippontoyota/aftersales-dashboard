import "./load-env.mjs";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true, ca: process.env.DATABASE_CA_CERT },
});

await pool.query(`
  -- 3C Referrals call-outcome form split into per-branch reason fields
  -- (2026-11-27, at the user's request) — mirrors bp_referrals'
  -- not_interested_reason precedent.
  alter table inactive_customer_referrals add column if not exists not_genuine_reason text;
  alter table inactive_customer_referrals add column if not exists not_interested_reason text;
`);

console.log("3C Referrals reason columns (not_genuine_reason, not_interested_reason) applied.");
await pool.end();
