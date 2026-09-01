-- Aftersales Intelligence Dashboard — schema for the Supabase Postgres
-- database. Mirrors the four JSON shapes the app used under data/ 1:1 —
-- no customer/vehicle/identity-resolution tables. This app only ever
-- aggregates branch-level daily/MTD numbers, never per-customer data.
--
-- Run once against a fresh database: node db/migrate.mjs

create table if not exists admins (
  username text primary key,
  password_hash text not null,
  salt text not null,
  role text not null check (role in ('hq', 'branch')),
  branch text,
  -- Dashboard visibility, independent of role: hq always has it (see
  -- getCurrentAdmin() usage in dashboard/page.tsx — computed as
  -- role='hq' OR dashboard_access), branch admins default to false and can
  -- be individually granted access via scripts/set-dashboard-access.mjs.
  -- Every branch admin can still upload regardless of this flag — it only
  -- gates the dashboard page.
  dashboard_access boolean not null default false,
  constraint branch_role_consistency check (
    (role = 'branch' and branch is not null) or (role = 'hq' and branch is null)
  )
);

-- One row per branch per date — mirrors data/uploads/{date}.json's `branches` array.
create table if not exists ba_tool_snapshots (
  date date not null,
  branch text not null,
  uploaded_at timestamptz not null,
  source_file_name text not null,
  pm numeric,
  pm_target numeric,
  bpus numeric,
  bpus_target numeric,
  spr_internal numeric,
  spr_internal_target numeric,
  spo_dealer numeric,
  spo_dealer_target numeric,
  spo_tgloss numeric,
  spo_tgloss_target numeric,
  cpus numeric,
  gus numeric,
  tyre_actual numeric,
  tyre_target numeric,
  battery_actuals numeric,
  battery_target numeric,
  service_penetration numeric,
  primary key (date, branch)
);

-- SPR External (External Sales, see report.ts) was added after this table
-- already existed in production — plain `create table if not exists` above
-- won't retrofit a new column onto it, hence the explicit alter.
alter table ba_tool_snapshots add column if not exists spr_external numeric;

-- Mirrors data/service-info/{date}/{branch}.json.
create table if not exists service_info_snapshots (
  date date not null,
  branch text not null,
  uploaded_at timestamptz not null,
  source_file_name text not null,
  wheel_balancing integer not null,
  wheel_alignment integer not null,
  brake_skimming integer not null,
  evaporator_cleaning integer not null,
  primary key (date, branch)
);

-- Mirrors data/part-sale/{date}/{branch}.json.
create table if not exists part_sale_snapshots (
  date date not null,
  branch text not null,
  uploaded_at timestamptz not null,
  source_file_name text not null,
  engine_flush numeric not null,
  injector_cleaner numeric not null,
  synthetic_oil_ltrs numeric not null,
  brake_cleaning_spray numeric not null,
  primary key (date, branch)
);

-- External Sales (AA-bill/PartNo-prefix filter, see part-sale/parse.ts) was
-- added after this table already existed in production — plain `create
-- table if not exists` above won't retrofit a new column onto it, hence the
-- explicit alter. Safe to re-run.
alter table part_sale_snapshots add column if not exists external_sales numeric not null default 0;

-- SSRV089 Cost & Sales Report comes as two distinct exports per branch per
-- day (General Service jobs vs Body & Paint jobs) — confirmed with the user
-- to be stored as separate rows, not merged. Only the 'general' variant
-- feeds GUS Parts/Labour MTD (see report.ts); 'body_paint' is stored for
-- completeness but unused by that formula today.
create table if not exists ssrv089_snapshots (
  date date not null,
  branch text not null,
  variant text not null check (variant in ('general', 'body_paint')),
  uploaded_at timestamptz not null,
  source_file_name text not null,
  accessories_part_sale numeric not null,
  accessories_labour_sale numeric not null,
  primary key (date, branch, variant)
);

-- scom205 Monthly KPI Report — values are already MTD-cumulative in the
-- source file, so unlike every other snapshot table this one has nothing
-- to accumulate across days; a given date's row is just that day's read.
create table if not exists scom205_snapshots (
  date date not null,
  branch text not null,
  uploaded_at timestamptz not null,
  source_file_name text not null,
  gus_sp_rev_mtd numeric not null,
  gus_lab_rev_mtd numeric not null,
  bpu_sp_rev_mtd numeric not null,
  bpu_lab_rev_mtd numeric not null,
  primary key (date, branch)
);

-- Idempotent add-column for tables that pre-date a given field —
-- `create table if not exists` above only handles brand-new databases.
alter table admins add column if not exists dashboard_access boolean not null default false;

-- Accessories department staff, branch-wise — used to identify which
-- SSRV089 rows are Accessories sales (see ssrv089/parse.ts, matched
-- against "Close SA Name"). Originally hardcoded from "2Accessories
-- SO.xlsx" (confirmed with the user, 2026-08-27); moved here so HQ can add
-- or remove a name through the app at /data as staff turns over, without a
-- code change. `unique` lets a re-run seed insert use `on conflict do
-- nothing` safely.
create table if not exists accessories_staff (
  id serial primary key,
  branch text not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (branch, name)
);
create index if not exists accessories_staff_branch_idx on accessories_staff (branch);

-- DIY (PartNo starting "D-DIY") — an informational breakdown added after
-- part_sale_snapshots already existed in production, hence the explicit
-- alter rather than a column in the create table above. These rows also
-- legitimately count toward external_sales (confirmed with the user
-- 2026-08-31: DIY isn't carved out of that total, just shown separately
-- alongside it).
alter table part_sale_snapshots add column if not exists diy_count numeric not null default 0;
alter table part_sale_snapshots add column if not exists diy_revenue numeric not null default 0;

-- VAS revenue (T-Gloss/Lexus treatments matched against the price list in
-- src/lib/vas-price-list.ts, by Job Code + Series + branch city tier) — an
-- informational-turned-tracked figure added after service_info_snapshots
-- already existed in production, hence the explicit alter. Confirmed with
-- the user 2026-08-31.
alter table service_info_snapshots add column if not exists vas_revenue numeric not null default 0;

-- A date is "published" once HQ has reviewed the day's compiled dashboard
-- and explicitly released it — only then can branch admins see the full
-- company-wide dashboard for that date (2026-08-31, at the user's request:
-- branch admins get the whole dashboard back, "just like HQ," but gated
-- behind this per-day HQ approval; HQ itself is never gated by this table).
-- Presence of a row = published; absence = not yet published.
create table if not exists dashboard_publish_log (
  date date primary key,
  published_at timestamptz not null,
  published_by text not null
);

-- Self-service branch-admin signup, gated by HQ approval (2026-09-01, at the
-- user's request: branch users request their own login — name, username,
-- password, branch — instead of everyone sharing the one fixed per-branch
-- account HQ originally provisioned; HQ has to explicitly approve before it
-- can actually log in, so anyone can't just create an account and get in).
-- The password is hashed at request time, exactly like a real account
-- (scrypt, salted, never stored in plain text anywhere) — approving just
-- copies the hash+salt straight into `admins`, nothing is re-collected. A
-- rejected or still-pending username has no row in `admins`, so it behaves
-- exactly like a login that never existed — see signup-store.ts.
create table if not exists admin_signup_requests (
  id serial primary key,
  name text not null,
  username text not null,
  password_hash text not null,
  salt text not null,
  branch text not null,
  status text not null check (status in ('pending', 'approved', 'rejected')) default 'pending',
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text
);
create index if not exists admin_signup_requests_status_idx on admin_signup_requests (status);
