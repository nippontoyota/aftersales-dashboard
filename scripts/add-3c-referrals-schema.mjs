import "./load-env.mjs";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true, ca: process.env.DATABASE_CA_CERT },
});

await pool.query(`
  -- 3C Referrals rework (2026-11-27, at the user's request): the plain
  -- "Referrals" call queue gains a detailed call-outcome/appointment/RO
  -- workflow, a payout ledger mirroring BP Referrals (₹50 genuine + ₹200
  -- RO-verified), and a standalone table of verified-genuine customers'
  -- contact numbers. See src/lib/inactive-referrals/store.ts.
  alter table inactive_customer_referrals add column if not exists genuine boolean;
  alter table inactive_customer_referrals add column if not exists customer_interested boolean;
  alter table inactive_customer_referrals add column if not exists validated_at timestamptz;
  alter table inactive_customer_referrals add column if not exists closed_at timestamptz;
  alter table inactive_customer_referrals add column if not exists closed_reason text;
  alter table inactive_customer_referrals drop constraint if exists inactive_customer_referrals_closed_reason_check;
  alter table inactive_customer_referrals add constraint inactive_customer_referrals_closed_reason_check
    check (closed_reason is null or closed_reason in ('not_genuine', 'not_interested'));
  alter table inactive_customer_referrals add column if not exists appointment_date date;
  alter table inactive_customer_referrals add column if not exists pending_ro_no varchar;
  alter table inactive_customer_referrals add column if not exists pending_ro_entered_at timestamptz;
  alter table inactive_customer_referrals add column if not exists matched_ro_no varchar;
  alter table inactive_customer_referrals add column if not exists ro_matched_at timestamptz;

  -- Structured reason code for a not-connected call, same convention as
  -- bp_referral_activity.not_connected_reason — alongside the free-text
  -- remark column already there, not instead of it.
  alter table inactive_referral_calls add column if not exists not_connected_reason text;

  -- Payout ledger, mirrors bp_referral_payouts exactly.
  create table if not exists inactive_referral_payouts (
    id              serial       primary key,
    employee_id     text,
    employee_name   text,
    employee_branch text,
    amount          numeric      not null,
    paid_at         timestamptz  not null default now(),
    paid_by         text         references admins(username)
  );
  create index if not exists inactive_referral_payouts_employee_idx
    on inactive_referral_payouts (employee_id, employee_name, employee_branch);

  -- Verified-genuine inactive customers' contact details, fed automatically
  -- once a referral's call outcome is saved as genuine — a standalone,
  -- reusable contact list (no MRS/VIN data, unlike ce_leads, which this
  -- isn't a fit for).
  create table if not exists verified_inactive_contacts (
    id                bigserial    primary key,
    referral_id       integer      not null references inactive_customer_referrals(id),
    customer_name     varchar,
    customer_phone_1  varchar,
    customer_phone_2  varchar,
    vehicle_reg_no    varchar,
    vehicle_model     varchar,
    branch            varchar,
    created_at        timestamptz  not null default now()
  );
  create unique index if not exists verified_inactive_contacts_referral_idx on verified_inactive_contacts (referral_id);
`);

console.log("3C Referrals schema (inactive_customer_referrals/_calls additions, inactive_referral_payouts, verified_inactive_contacts) applied.");
await pool.end();
