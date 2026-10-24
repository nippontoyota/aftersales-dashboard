// Creates just total_car_care_treatments_daily — apply-schema.mjs's
// full-file replay still fails on the pre-existing, unrelated
// admins_role_check issue (see create-unique-vin-vas-table.mjs), so this
// applies only the new table in isolation.
import { Client } from "pg";
import "./load-env.mjs";

const sql = `
create table if not exists total_car_care_treatments_daily (
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
  console.log("total_car_care_treatments_daily created (or already existed).");
} finally {
  await client.end();
}
