import "./load-env.mjs";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true, ca: process.env.DATABASE_CA_CERT },
});

await pool.query(`
  alter table ce_lead_workflow drop constraint if exists ce_lead_workflow_status_check;
  alter table ce_lead_workflow add constraint ce_lead_workflow_status_check
    check (status in ('New', 'Attempted', 'Connected', 'Follow-up', 'Appointment booked', 'Converted', 'Vehicle sold', 'Serviced elsewhere', 'Not interested', 'Unreachable', 'MRS follow-up already scheduled'));
`);

console.log("ce_lead_workflow_status_check updated to allow 'MRS follow-up already scheduled'.");
await pool.end();
