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
  -- 'vp_service' is read-only and company-wide (no branch/region/publish
  -- gate) — the VP Service executive view at /vp. See src/app/vp/*.
  constraint admins_role_check check (role in ('hq', 'branch', 'regional', 'vp_service')),
  constraint admins_role_scope_consistency check (
    (role = 'branch'     and branch is not null and region is null) or
    (role = 'hq'         and branch is null     and region is null) or
    (role = 'regional'   and branch is null     and region in ('North', 'Central', 'South')) or
    (role = 'vp_service' and branch is null     and region is null)
  )
);
-- Upgrade an existing database:
alter table admins add column if not exists region text;
alter table admins drop constraint if exists branch_role_consistency;
alter table admins drop constraint if exists admins_role_check;
alter table admins add constraint admins_role_check check (role in ('hq', 'branch', 'regional', 'vp_service'));
alter table admins drop constraint if exists admins_role_scope_consistency;
alter table admins add constraint admins_role_scope_consistency check (
  (role = 'branch'     and branch is not null and region is null) or
  (role = 'hq'         and branch is null     and region is null) or
  (role = 'regional'   and branch is null     and region in ('North', 'Central', 'South')) or
  (role = 'vp_service' and branch is null     and region is null)
);

-- VP Service → HQ query/flag threads. The VP pins a flag to whatever they
-- were looking at (page + date + optional region/branch/metric/value); HQ
-- replies in-app; the relevant regional manager sees flags touching their
-- branches. See src/lib/vp-flags/store.ts.
create table if not exists vp_flags (
  id bigint generated always as identity primary key,
  created_by text not null references admins(username),
  created_at timestamptz not null default now(),
  context_page text not null,
  context_date date,
  context_region text,
  context_branch text,
  context_metric text,
  context_value text,
  note text not null,
  status text not null default 'open',
  hq_reply text,
  replied_by text references admins(username),
  replied_at timestamptz,
  constraint vp_flags_status_check check (status in ('open', 'answered', 'closed')),
  constraint vp_flags_page_check check (context_page in ('overview', 'region', 'branch'))
);
create index if not exists vp_flags_status_idx on vp_flags (status, created_at desc);
create index if not exists vp_flags_branch_idx on vp_flags (context_branch) where context_branch is not null;

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
  -- Distinct repair orders with a brake-skimming line that day (per-RO, not
  -- per-line — see service-info/parse.ts; changed from per-line 2026-09-07).
  brake_skimming integer not null,
  -- Front-evaporator T-Gloss treatment rows only (rear + "Front and Rear"
  -- excluded 2026-09-07 — see service-info/parse.ts).
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
  -- Litres: sum of the oil SKUs' Sale Qty ÷ 10 (the DMS records these in
  -- tenths of a litre — confirmed with the user 2026-09-04; parse.ts used
  -- ÷100 until then, and every pre-existing row was corrected in place with
  -- `synthetic_oil_ltrs = synthetic_oil_ltrs * 10`).
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
-- The file itself is always kept here, raw, so the upload can be tracked
-- and locked exactly like the other four (see raw-report-uploads/store.ts),
-- and re-read later if a real use for the data emerges. One table covers
-- both report types (report_type distinguishes them) since they're
-- identical in every way that matters here: one file per branch per date,
-- HQ can correct via Upload Sheet like anything else.
--
-- Cost and Sales Report - BP is still never parsed (BP jobs don't carry an
-- Accessories deduction the way GS ones do). Service Info - BP *is* now
-- also parsed on top of being kept here — see service_info_bp_snapshots
-- below (2026-09-11, at the user's request).
create table if not exists raw_report_uploads (
  date date not null,
  branch text not null,
  report_type text not null check (report_type in ('service_info_bp', 'ssrv089_bp')),
  uploaded_at timestamptz not null,
  source_file_name text not null,
  file_data bytea not null,
  primary key (date, branch, report_type)
);

-- Service Info Report - BP, parsed with the exact same rules as the GS
-- table above (service-info/parse.ts) — Wheel Balancing / Wheel Alignment /
-- Brake Skimming / VAS Revenue only. Evaporator Cleaning is deliberately
-- NOT tracked here: the user asked for GS+BP on the other four, but
-- Evaporator Cleaning stays GS-only. Added onto the existing GS totals at
-- read time (see loadCombinedServiceInfoSnapshots* in service-info/store.ts)
-- rather than merged into service_info_snapshots itself, so GS-only figures
-- stay queryable and the upload-lock / pending-uploads checks (which must
-- stay GS-only) are untouched. 2026-09-11, at the user's request — rare in
-- practice (a BP job order doesn't usually carry these job codes), backfilled
-- for the rest of the month once added.
create table if not exists service_info_bp_snapshots (
  date date not null,
  branch text not null,
  uploaded_at timestamptz not null,
  source_file_name text not null,
  wheel_balancing integer not null,
  wheel_alignment integer not null,
  brake_skimming integer not null,
  vas_revenue numeric not null,
  primary key (date, branch)
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

-- Bill revenue is attributed to the invoice's own date, not the upload time
-- (2026-09-04, at the user's request) — so historical invoices backfill into
-- the right months and a bill always counts in the month it was raised.
-- Extracted from the PDF; the upload form requires a manual date when
-- extraction fails. Nullable only for rows saved before this existed —
-- queries coalesce to the upload day for those.
alter table bill_uploads add column if not exists invoice_date date;
create index if not exists idx_bill_uploads_category_invoice_date
  on bill_uploads (category, invoice_date);
create index if not exists idx_bill_uploads_branch_invoice_date
  on bill_uploads (branch, invoice_date);

-- Tax Invoice Cancellation Report (2026-09-07, at the user's request) — the
-- per-branch PDF export from the DMS listing cancelled tax invoices, with
-- the reason and the RO each belonged to. Each BRANCH uploads its own,
-- whenever a cancellation comes in — the report can be run for a single
-- day, a date range, or a whole month (HQ can also upload — the branch is
-- taken from the report header). One row per cancelled invoice, keyed by
-- its DocNo. This is a CONTROL / AUDIT feed only — it never touches any
-- revenue figure. scom205 (the Total Revenue source) already excludes
-- cancelled invoices as of its own run time (confirmed with the user), so
-- the value is (a) reconciliation — catching a cancellation that landed
-- after a closed month's last scom205 pull and is therefore still in that
-- frozen figure — and (b) a branch data-quality metric (how many invoices
-- got cancelled, why, how much). See src/lib/cancellation/.
--
-- Upload semantics: each upload UPSERTs the rows it carries, keyed by DocNo,
-- and removes nothing — a cancellation is terminal (it never un-cancels),
-- so a partial-range upload accumulates and a re-upload just refreshes.
-- `month` is each row's own cancel-date month. invoice_cancellation_files
-- keeps the latest uploaded PDF per (branch, month).
create table if not exists invoice_cancellations (
  doc_no          text        primary key,           -- the cancelled invoice number (TXA…/BSA…/INA…/ASA…)
  branch          text        not null,
  month           text        not null,              -- 'YYYY-MM' of cancel_date — the month this cancellation is grouped under
  cancel_date     date        not null,
  -- Full "Cancel Date/Time" from the report (IST), e.g. 2026-08-31 12:44+05:30.
  -- Used by the reconciliation check to compare against when the branch's
  -- scom205 was last pulled/uploaded. Null on rows saved before this column
  -- existed — the check falls back to cancel_date for those.
  cancel_at       timestamptz,
  cancel_reason   text        not null,              -- normalized: 'Data Entry Mistake' | 'Cancelled for Warranty' | 'Wrong Tax Calculation' | 'Others - Dealer' | 'Others - Customer' | 'Customer Mind Change' | other (verbatim)
  ref_doc_no      text,                              -- the RO / job order (GSJ…/BPE…) — the join key to SSRV089; null if the report omitted it
  reg_no          text,
  owner_code      text,
  owner_name      text,
  doc_customer    text,                              -- billed-to party (can differ from owner — e.g. an insurer)
  issue_date      date,
  before_tax      numeric     not null,
  tax             numeric     not null,
  after_tax       numeric     not null,
  cancelled_by    text,
  source_file_name text       not null,
  uploaded_at     timestamptz not null,
  uploaded_by     text        not null
);
create index if not exists idx_invoice_cancellations_branch_month
  on invoice_cancellations (branch, month);
create index if not exists idx_invoice_cancellations_ref_doc
  on invoice_cancellations (ref_doc_no);
-- Added after the table already existed in production.
alter table invoice_cancellations add column if not exists cancel_at timestamptz;

-- Retains the uploaded PDF bytes, one per (branch, month), so the source is
-- there to look at later — same pattern as raw_report_uploads. Kept in its
-- own table rather than a bytea column on invoice_cancellations because that
-- table has one row PER cancelled invoice, not one per file.
create table if not exists invoice_cancellation_files (
  branch           text        not null,
  month            text        not null,
  uploaded_at      timestamptz not null,
  uploaded_by      text        not null,
  source_file_name text        not null,
  file_data        bytea       not null,
  primary key (branch, month)
);

-- Report holidays (2026-09-09, at the user's request). HQ flags a date as a
-- non-working day; the branch upload page then computes ONE report date for
-- everyone — the most recent day before today that is neither a Saturday nor
-- a holiday — so branches can't each file the same round under a different
-- date. See src/lib/reporting-date.ts. Saturdays are skipped by rule (they
-- work, but the data only reaches us Monday folded in with Sunday);
-- Sundays count as normal report dates.
create table if not exists report_holidays (
  date        date        primary key,
  note        text,
  created_by  text        not null,
  created_at  timestamptz not null default now()
);
