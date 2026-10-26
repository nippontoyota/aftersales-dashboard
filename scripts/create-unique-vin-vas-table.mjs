// Creates just unique_vin_vas_daily — apply-schema.mjs's full-file replay
// currently fails on a pre-existing, unrelated issue (admins_role_check
// violated by a live row), so this applies only the new table in isolation.
import { Client } from "pg";
import "./load-env.mjs";

const sql = `
create table if not exists unique_vin_vas_daily (
  date date not null,
  branch text not null,
  count integer not null default 0,
  computed_at timestamptz not null default now(),
  primary key (date, branch)
);
`;

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  console.log("unique_vin_vas_daily created (or already existed).");
} finally {
  await client.end();
}
