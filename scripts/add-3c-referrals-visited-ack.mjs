import "./load-env.mjs";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true, ca: process.env.DATABASE_CA_CERT },
});

await pool.query(`
  -- 3C Referrals "Already visited" quick action (2026-11-28, at the user's
  -- request) — lets a branch clear a false "No show" the moment they know
  -- the vehicle actually came in, without yet having the RO number to hand.
  alter table inactive_customer_referrals add column if not exists visited_ack_at timestamptz;
  alter table inactive_customer_referrals add column if not exists visited_ack_by text references admins(username);
`);

console.log("3C Referrals visited-ack columns (visited_ack_at, visited_ack_by) applied.");
await pool.end();
