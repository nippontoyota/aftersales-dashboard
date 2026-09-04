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
  -- 'hq' uploads + publishes; 'branch' uploads its own reports; 'regional'
  -- is read-only, scoped to one region (see `region` below).
  role text not null,
  branch text,
  -- Set only for role='regional' — the region (North/Central/South) whose
  -- branches this account can see before HQ publishes. See dashboard-data.ts.
  region text,
  -- Dashboard visibility, independent of role: hq always has it (see
  -- getCurrentAdmin() usage in dashboard/page.tsx — computed as
  -- role='hq' OR dashboard_access), branch admins default to false and can
  -- be individually granted access via scripts/set-dashboard-access.mjs.
  -- Every branch admin can still upload regardless of this flag — it only
  -- gates the dashboard page.
  dashboard_access boolean not null default false,
  constraint admins_role_check check (role in ('hq', 'branch', 'regional')),
  constraint admins_role_scope_consistency check (
    (role = 'branch'   and branch is not null and region is null) or
    (role = 'hq'       and branch is null     and region is null) or
    (role = 'regional' and branch is null     and region in ('North', 'Central', 'South'))
  )
);
-- Upgrade an existing database:
alter table admins add column if not exists region text;
alter table admins drop constraint if exists branch_role_consistency;
alter table admins drop constraint if exists admins_role_check;
alter table admins add constraint admins_role_check check (role in ('hq', 'branch', 'regional'));
alter table admins drop constraint if exists admins_role_scope_consistency;
alter table admins add constraint admins_role_scope_consistency check (
  (role = 'branch'   and branch is not null and region is null) or
  (role = 'hq'       and branch is null     and region is null) or
  (role = 'regional' and branch is null     and region in ('North', 'Central', 'South'))
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

-- Service Information Report - BP and Cost and Sales Report - BP
-- (2026-09-01, at the user's request): two more required daily uploads per
-- branch, alongside the four that already feed real dashboard figures.
-- Nothing is parsed out of either one yet — the file itself is just kept,
-- so the upload can still be tracked and locked exactly like the other
-- four (see raw-report-uploads/store.ts), and revisited later if a real
-- use for the data emerges. One table covers both report types (report_type
-- distinguishes them) since they're identical in every way that matters
-- here: no parsing, one file per branch per date, HQ can correct via
-- Upload Sheet like anything else.
create table if not exists raw_report_uploads (
  date date not null,
  branch text not null,
  report_type text not null check (report_type in ('service_info_bp', 'ssrv089_bp')),
  uploaded_at timestamptz not null,
  source_file_name text not null,
  file_data bytea not null,
  primary key (date, branch, report_type)
);

-- Every row of every uploaded file, verbatim (2026-09-01, at the user's
-- request: "all the fields and rows in excel need to be saved in supabase,
-- otherwise later if i need to pull something, it will be difficult") — the
-- parsed snapshot tables above only ever kept the final computed totals, so
-- a rule change (like the accessories-staff VAS exclusion added the same
-- day) can never be applied retroactively without the original file back in
-- hand. This is that missing piece: one row per source-file row, every
-- column preserved as JSON (not just the columns a parser currently reads),
-- so a later question — a new formula, a correction, an audit — can be
-- answered by querying this table instead of hunting down the original
-- file again. Covers service_info/ssrv089/part_sale/scom205 (one branch's
-- own upload) and ba_tool (one HQ upload spanning every branch — `branch`
-- comes from that row's own branch column, not the uploader).
create table if not exists raw_upload_rows (
  id bigserial primary key,
  report_type text not null check (report_type in ('service_info', 'ssrv089', 'part_sale', 'scom205', 'ba_tool')),
  date date not null,
  branch text not null,
  uploaded_at timestamptz not null,
  source_file_name text not null,
  row_index integer not null,
  row_data jsonb not null
);
create index if not exists raw_upload_rows_lookup_idx on raw_upload_rows (report_type, date, branch);
create index if not exists raw_upload_rows_data_gin_idx on raw_upload_rows using gin (row_data);

-- PDF bill uploads (2026-09-02, at the user's request): any logged-in user
-- can upload a Toyota or generic PDF tax invoice; the app auto-extracts the
-- total taxable value and invoice number, stores the PDF in Supabase
-- Storage, and shows monthly aggregated totals on the dashboard. Unlike the
-- snapshot tables (one row per branch per date), each bill is its own row
-- keyed by invoice_number; duplicate detection is by that unique constraint.
create table if not exists bill_uploads (
  id              bigserial    primary key,
  invoice_number  text         not null unique,
  branch          text         not null,
  taxable_value   numeric      not null,
  file_data       bytea        not null,
  source_file_name text        not null,
  uploaded_at     timestamptz  not null,
  uploaded_by     text         not null,
  extraction_method text       not null check (extraction_method in ('auto', 'manual'))
);
create index if not exists idx_bill_uploads_branch_uploaded
  on bill_uploads (branch, uploaded_at);
-- Migrate from storage_path to file_data if upgrading an existing database:
alter table bill_uploads add column if not exists file_data bytea;
alter table bill_uploads drop column if exists storage_path;

-- Scrap vs used-oil revenue classification (2026-09-02, at the user's
-- request). Each bill's taxable value ("without tax") is counted as either
-- scrap revenue or used oil revenue, chosen on the upload form, and folded
-- into Total Revenue Stream MTD. Nullable: a bill with no category counts
-- toward neither line until classified.
alter table bill_uploads add column if not exists category text
  check (category in ('scrap', 'used_oil'));
create index if not exists idx_bill_uploads_category_uploaded
  on bill_uploads (category, uploaded_at);
