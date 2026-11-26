import "./load-env.mjs";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true, ca: process.env.DATABASE_CA_CERT },
});

await pool.query(`
  create table if not exists ce_conquest_bulk_apply_log (
    id          bigserial    primary key,
    uploaded_by text         not null references admins(username),
    file_name   text,
    row_number  integer      not null,
    lead_id     bigint       not null,
    success     boolean      not null,
    message     text         not null,
    created_at  timestamptz  not null default now()
  );
  create index if not exists ce_conquest_bulk_apply_log_run_idx on ce_conquest_bulk_apply_log (uploaded_by, created_at desc);
`);

console.log("ce_conquest_bulk_apply_log created.");
await pool.end();
