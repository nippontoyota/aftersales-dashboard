// One-off: flag 2026-10-21 as a report holiday so reportingDate() falls back
// to 2026-10-20 as the computed default (see src/lib/reporting-date.ts and
// src/app/data/page.tsx's Report Holidays panel, which this mirrors).
import "./load-env.mjs";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true, ca: process.env.DATABASE_CA_CERT },
});

const date = "2026-10-21";
const note = "Holiday";
const createdBy = "admin";

await pool.query(
  "insert into report_holidays (date, note, created_by) values ($1, $2, $3) on conflict (date) do update set note = excluded.note",
  [date, note, createdBy],
);

const { rows } = await pool.query("select date::text as date, note, created_by from report_holidays where date = $1", [date]);
console.log("report_holidays row:", rows[0]);

await pool.end();
