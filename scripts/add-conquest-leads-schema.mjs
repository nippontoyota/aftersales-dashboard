import "./load-env.mjs";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true, ca: process.env.DATABASE_CA_CERT },
});

await pool.query(`
  create table if not exists ce_conquest_leads (
    id bigint generated always as identity primary key,
    registration_no text not null,
    vin text,
    owner_name text,
    owner_mobile text,
    vehicle_model text,
    vehicle_maker text,
    registration_date date,
    address text,
    source_file text not null,
    active boolean not null default true,
    imported_at timestamptz not null default now()
  );
  create unique index if not exists ce_conquest_leads_regno_idx on ce_conquest_leads (registration_no);
  create unique index if not exists ce_conquest_leads_vin_idx on ce_conquest_leads (vin) where vin is not null;
  create index if not exists ce_conquest_leads_name_search_idx on ce_conquest_leads (lower(owner_name));

  create table if not exists ce_conquest_workflow (
    conquest_lead_id bigint primary key references ce_conquest_leads(id),
    status text not null default 'New',
    next_follow_up_date date,
    attempt_count smallint not null default 0 check (attempt_count between 0 and 5),
    latest_call_status text check (latest_call_status in ('connected', 'not_connected')),
    latest_outcome text,
    assigned_to text references admins(username),
    last_editor text references admins(username),
    updated_at timestamptz not null default now(),
    constraint ce_conquest_workflow_status_check check (status in ('New', 'Attempted', 'Connected', 'Follow-up', 'Appointment booked', 'Converted', 'Vehicle sold', 'Serviced elsewhere', 'Not interested', 'Unreachable'))
  );
  create index if not exists ce_conquest_workflow_followup_idx on ce_conquest_workflow (next_follow_up_date) where next_follow_up_date is not null;
  create index if not exists ce_conquest_workflow_assigned_idx on ce_conquest_workflow (assigned_to);

  create table if not exists ce_conquest_activity (
    id bigint generated always as identity primary key,
    conquest_lead_id bigint not null references ce_conquest_leads(id),
    previous_status text not null,
    status text not null,
    next_follow_up_date date,
    note text not null,
    attempt_number smallint check (attempt_number between 1 and 5),
    call_status text check (call_status in ('connected', 'not_connected')),
    outcome text,
    author text not null references admins(username),
    created_at timestamptz not null default now()
  );
  create index if not exists ce_conquest_activity_lead_idx on ce_conquest_activity (conquest_lead_id, created_at desc, id desc);
`);

console.log("Conquest-leads schema (ce_conquest_leads, ce_conquest_workflow, ce_conquest_activity) applied.");
await pool.end();
