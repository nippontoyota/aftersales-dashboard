import "server-only";
import { pool } from "@/lib/db";
import type { CeLeadInput, ParsedCeWorkbook } from "./parse";
import { LEXUS_VIN_WMI_PREFIXES, type CeVehicleBrand } from "./vehicle-brand";
import {
  CE_DUE_KM, CE_DUE_MONTHS, CE_MIN_PLAUSIBLE_KM_PER_DAY, CE_MRS_PRIORITY_LEAD_DAYS, CE_MRS_RESOLVED_STATUSES, CE_MRS_WINDOW_DAYS,
  deriveCeCallUpdate, indiaDate,
  type CeAvfCategory, type CeCallOutcome, type CeCallStatus, type CeCategory, type CeFollowUpFilter, type CeStatus,
} from "./rules";

export type CeImportInfo = {
  id: string;
  sourceFileName: string;
  importKind: "uio" | "dms";
  uploadedBy: string;
  uploadedAt: string;
  rowCount: number;
  minReportDate: string;
  maxReportDate: string;
};

export type CeLeadListRow = {
  vin: string;
  customerName: string;
  allocatedDealer: string;
  nReportDate: string;
  nMileage: number;
  ageDays: number;
  category: CeCategory;
  status: CeStatus;
  nextFollowUpDate: string | null;
  attemptCount: number;
  contactNumber: string | null;
  vehicleModel: string | null;
};

export type CeAvfListRow = {
  vin: string;
  customerName: string;
  allocatedDealer: string;
  nReportDate: string;
  nMileage: number;
  n1Mileage: number | null;
  avf: number | null;
  category: CeAvfCategory;
  status: CeStatus;
  nextFollowUpDate: string | null;
  contactNumber: string | null;
  vehicleModel: string | null;
};

export type CeLeadDetail = CeLeadInput & {
  active: boolean;
  status: CeStatus;
  nextFollowUpDate: string | null;
  attemptCount: number;
  latestCallStatus: CeCallStatus | null;
  latestOutcome: CeCallOutcome | null;
  lastEditor: string | null;
  updatedAt: string;
  sourceFileName: string;
  importedAt: string;
  ageDays: number;
  category: CeCategory;
  contactNumber: string | null;
  vehicleModel: string | null;
  dmsSourceFileName: string | null;
  dmsImportedAt: string | null;
  assignedTo: string | null;
};

export type CeActivity = {
  id: string;
  previousStatus: CeStatus;
  status: CeStatus;
  nextFollowUpDate: string | null;
  note: string;
  attemptNumber: number | null;
  callStatus: CeCallStatus | null;
  outcome: CeCallOutcome | null;
  author: string;
  createdAt: string;
};

function dateOnly(value: unknown): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    const pad = (part: number) => String(part).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  throw new Error("Database returned an invalid CE date.");
}

const mapImport = (row: Record<string, unknown>): CeImportInfo => ({
  id: String(row.id),
  sourceFileName: String(row.source_file_name),
  importKind: row.import_kind === "dms" ? "dms" : "uio",
  uploadedBy: String(row.uploaded_by),
  uploadedAt: new Date(String(row.uploaded_at)).toISOString(),
  rowCount: Number(row.row_count),
  minReportDate: dateOnly(row.min_report_date),
  maxReportDate: dateOnly(row.max_report_date),
});

export async function replaceCeLeads(
  parsed: ParsedCeWorkbook,
  fileName: string,
  username: string,
): Promise<{ importedRows: number; archivedRows: number; fileName: string; minReportDate: string; maxReportDate: string }> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(20261017)");
    const previous = await client.query<{ vin: string }>("select vin from ce_leads where active for update");
    const imported = await client.query<{ id: string }>(
      `insert into ce_lead_imports (source_file_name, import_kind, uploaded_by, row_count, min_report_date, max_report_date)
       values ($1, 'uio', $2, $3, $4, $5) returning id`,
      [fileName, username, parsed.rows.length, parsed.minReportDate, parsed.maxReportDate],
    );
    const importId = imported.rows[0].id;
    await client.query("update ce_leads set active = false where active");

    const records = parsed.rows.map((row) => ({
      allocated_dealer: row.allocatedDealer,
      dealer_zone: row.dealerZone,
      vin: row.vin,
      sale_dealer_code: row.saleDealerCode,
      sales_date: row.salesDate,
      uio_year: row.uioYear,
      sale_branch_code: row.saleBranchCode,
      n_dealer_code: row.nDealerCode,
      avf: row.avf,
      n_report_date: row.nReportDate,
      n_mileage: row.nMileage,
      n1_dealer_code: row.n1DealerCode,
      n1_report_date: row.n1ReportDate,
      n1_mileage: row.n1Mileage,
      n2_dealer_code: row.n2DealerCode,
      n2_mileage: row.n2Mileage,
      n2_report_date: row.n2ReportDate,
      customer_first_name: row.customerFirstName,
      customer_family_name: row.customerFamilyName,
    }));

    await client.query(
      `insert into ce_leads (
        allocated_dealer, dealer_zone, vin, sale_dealer_code, sales_date, uio_year, sale_branch_code,
        n_dealer_code, avf, n_report_date, n_mileage, n1_dealer_code, n1_report_date, n1_mileage,
        n2_dealer_code, n2_mileage, n2_report_date, customer_first_name, customer_family_name,
        active, source_import_id, imported_at
      )
      select r.allocated_dealer, r.dealer_zone, r.vin, r.sale_dealer_code, r.sales_date, r.uio_year,
        r.sale_branch_code, r.n_dealer_code, r.avf, r.n_report_date, r.n_mileage, r.n1_dealer_code,
        r.n1_report_date, r.n1_mileage, r.n2_dealer_code, r.n2_mileage, r.n2_report_date,
        r.customer_first_name, r.customer_family_name, true, $2, now()
      from jsonb_to_recordset($1::jsonb) as r(
        allocated_dealer text, dealer_zone text, vin text, sale_dealer_code text, sales_date date,
        uio_year integer, sale_branch_code text, n_dealer_code text, avf numeric, n_report_date date,
        n_mileage numeric, n1_dealer_code text, n1_report_date date, n1_mileage numeric,
        n2_dealer_code text, n2_mileage numeric, n2_report_date date, customer_first_name text,
        customer_family_name text
      )
      on conflict (vin) do update set
        allocated_dealer = excluded.allocated_dealer, dealer_zone = excluded.dealer_zone,
        sale_dealer_code = excluded.sale_dealer_code, sales_date = excluded.sales_date, uio_year = excluded.uio_year,
        sale_branch_code = excluded.sale_branch_code,
        -- The N/N1/N2/avf service-history chain may have been advanced past
        -- this workbook's extract date by a later DMS import (dms.mjs) — only
        -- let this upload move it forward, never back, mirroring the "newer
        -- wins" guard import-ce-dms.mjs already applies to the same columns.
        n_dealer_code = case when excluded.n_report_date > ce_leads.n_report_date then excluded.n_dealer_code else ce_leads.n_dealer_code end,
        avf = case when excluded.n_report_date > ce_leads.n_report_date then excluded.avf else ce_leads.avf end,
        n_report_date = case when excluded.n_report_date > ce_leads.n_report_date then excluded.n_report_date else ce_leads.n_report_date end,
        n_mileage = case when excluded.n_report_date > ce_leads.n_report_date then excluded.n_mileage else ce_leads.n_mileage end,
        n1_dealer_code = case when excluded.n_report_date > ce_leads.n_report_date then excluded.n1_dealer_code else ce_leads.n1_dealer_code end,
        n1_report_date = case when excluded.n_report_date > ce_leads.n_report_date then excluded.n1_report_date else ce_leads.n1_report_date end,
        n1_mileage = case when excluded.n_report_date > ce_leads.n_report_date then excluded.n1_mileage else ce_leads.n1_mileage end,
        n2_dealer_code = case when excluded.n_report_date > ce_leads.n_report_date then excluded.n2_dealer_code else ce_leads.n2_dealer_code end,
        n2_mileage = case when excluded.n_report_date > ce_leads.n_report_date then excluded.n2_mileage else ce_leads.n2_mileage end,
        n2_report_date = case when excluded.n_report_date > ce_leads.n_report_date then excluded.n2_report_date else ce_leads.n2_report_date end,
        dms_import_id = case when excluded.n_report_date > ce_leads.n_report_date then null else ce_leads.dms_import_id end,
        customer_first_name = excluded.customer_first_name, customer_family_name = excluded.customer_family_name,
        active = true, source_import_id = excluded.source_import_id, imported_at = now()`,
      [JSON.stringify(records), importId],
    );
    await client.query(
      `insert into ce_lead_workflow (vin)
       select vin from ce_leads where active on conflict (vin) do nothing`,
    );
    const previousVins = previous.rows.map((row) => row.vin);
    const archived = previousVins.length
      ? await client.query<{ count: string }>("select count(*) from ce_leads where not active and vin = any($1::text[])", [previousVins])
      : { rows: [{ count: "0" }] };
    await client.query("commit");
    return {
      importedRows: parsed.rows.length,
      archivedRows: Number(archived.rows[0].count),
      fileName,
      minReportDate: parsed.minReportDate,
      maxReportDate: parsed.maxReportDate,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
export async function loadLatestCeImport(): Promise<CeImportInfo | null> {
  const { rows } = await pool.query("select * from ce_lead_imports order by uploaded_at desc, id desc limit 1");
  return rows[0] ? mapImport(rows[0]) : null;
}

async function loadCeDealers(active: boolean): Promise<string[]> {
  const { rows } = await pool.query<{ allocated_dealer: string }>(
    "select distinct allocated_dealer from ce_leads where active = $1 and allocated_dealer <> '' order by allocated_dealer",
    [active],
  );
  return rows.map((row) => row.allocated_dealer);
}

async function loadCeReportYears(active: boolean): Promise<number[]> {
  const { rows } = await pool.query<{ report_year: number }>(
    "select distinct extract(year from n_report_date)::int report_year from ce_leads where active = $1 order by report_year desc",
    [active],
  );
  return rows.map((row) => Number(row.report_year));
}

export async function loadCeLeadPage(options: {
  today: string;
  active: boolean;
  query?: string;
  categories?: CeCategory[];
  statuses?: CeStatus[];
  dealers?: string[];
  followUps?: CeFollowUpFilter[];
  assignedTo?: string;
  month?: number;
  year?: number;
  page?: number;
}) {
  const values: unknown[] = [options.today, options.active];
  const where = ["l.active = $2"];
  if (options.assignedTo) {
    values.push(options.assignedTo);
    where.push(`w.assigned_to = $${values.length}`);
  }
  if (options.query) {
    values.push(`%${options.query}%`);
    where.push(`(l.vin ilike $${values.length} or concat_ws(' ', l.customer_first_name, l.customer_family_name) ilike $${values.length} or l.contact_number ilike $${values.length} or l.vehicle_model ilike $${values.length})`);
  }
  if (options.categories?.length) {
    const ranges = { hot: "between 0 and 364", warm: "between 365 and 730", cold: ">= 731" } as const;
    where.push(`(${options.categories.map((category) => `($1::date - l.n_report_date) ${ranges[category]}`).join(" or ")})`);
  }
  if (options.statuses?.length) {
    values.push(options.statuses);
    where.push(`w.status = any($${values.length}::text[])`);
  }
  if (options.dealers?.length) {
    values.push(options.dealers);
    where.push(`l.allocated_dealer = any($${values.length}::text[])`);
  }
  if (options.followUps?.length) {
    // 'Appointment booked' excluded alongside the terminal statuses
    // (2026-11-03, at the user's request): its next_follow_up_date is the
    // appointment date, not a "call again" reminder — the customer is
    // already booked in, so it shouldn't keep resurfacing in the call
    // queue just because that date has arrived or passed.
    const followUps = {
      due: "(w.next_follow_up_date <= $1::date and w.status not in ('Converted', 'Vehicle sold', 'Serviced elsewhere', 'Not interested', 'Unreachable', 'Appointment booked'))",
      upcoming: "(w.next_follow_up_date > $1::date and w.status not in ('Converted', 'Vehicle sold', 'Serviced elsewhere', 'Not interested', 'Unreachable', 'Appointment booked'))",
      none: "w.next_follow_up_date is null",
    } as const;
    where.push(`(${options.followUps.map((filter) => followUps[filter]).join(" or ")})`);
  }
  if (options.month) {
    values.push(options.month);
    where.push(`extract(month from l.n_report_date)::int = $${values.length}`);
  }
  if (options.year) {
    values.push(options.year);
    where.push(`extract(year from l.n_report_date)::int = $${values.length}`);
  }
  const clause = where.join(" and ");
  const page = Math.max(1, options.page ?? 1);
  const limit = 50;
  const filterValues = [...values];
  values.push(limit, (page - 1) * limit);
  const [list, counts, latest, activeCount, dealers, years] = await Promise.all([
    pool.query(
      `select l.vin, trim(concat_ws(' ', l.customer_first_name, l.customer_family_name)) customer_name,
        l.allocated_dealer, l.n_report_date, l.n_mileage, ($1::date - l.n_report_date)::int age_days,
        case when ($1::date - l.n_report_date) <= 364 then 'hot' when ($1::date - l.n_report_date) <= 730 then 'warm' else 'cold' end category,
        w.status, w.next_follow_up_date, w.attempt_count, l.contact_number, l.vehicle_model
       from ce_leads l join ce_lead_workflow w using (vin)
       where ${clause}
       order by l.n_report_date desc, l.vin
       limit $${values.length - 1} offset $${values.length}`,
      values,
    ),
    pool.query<{ hot: string; warm: string; cold: string }>(
      `select count(*) filter (where ($1::date - n_report_date) between 0 and 364) hot,
        count(*) filter (where ($1::date - n_report_date) between 365 and 730) warm,
        count(*) filter (where ($1::date - n_report_date) >= 731) cold
       from ce_leads where active`,
      [options.today],
    ),
    loadLatestCeImport(),
    pool.query<{ count: string }>(`select count(*) from ce_leads l join ce_lead_workflow w using (vin) where $1::date is not null and ${clause}`, filterValues),
    loadCeDealers(options.active),
    loadCeReportYears(options.active),
  ]);
  const leadRows: CeLeadListRow[] = list.rows.map((row) => ({
    vin: row.vin,
    customerName: row.customer_name || "Unnamed customer",
    allocatedDealer: row.allocated_dealer,
    nReportDate: dateOnly(row.n_report_date),
    nMileage: Number(row.n_mileage),
    ageDays: Number(row.age_days),
    category: row.category,
    status: row.status,
    nextFollowUpDate: row.next_follow_up_date ? dateOnly(row.next_follow_up_date) : null,
    attemptCount: Number(row.attempt_count),
    contactNumber: row.contact_number,
    vehicleModel: row.vehicle_model,
  }));
  return {
    rows: leadRows,
    total: Number(activeCount.rows[0].count),
    page,
    pageCount: Math.max(1, Math.ceil(Number(activeCount.rows[0].count) / limit)),
    counts: { hot: Number(counts.rows[0].hot), warm: Number(counts.rows[0].warm), cold: Number(counts.rows[0].cold) },
    dealers,
    years,
    latestImport: latest,
  };
}

export type CeMrsListRow = {
  vin: string;
  customerName: string;
  allocatedDealer: string;
  nReportDate: string;
  nMileage: number;
  dueDate: string;
  status: CeStatus;
  nextFollowUpDate: string | null;
  attemptCount: number;
  contactNumber: string | null;
  vehicleModel: string | null;
  assignedTo: string | null;
};

// Computes the due-date proxy (rules.ts's ceDueDate, re-expressed in SQL
// so filtering runs against the whole active table in one pass instead
// of pulling ~150k rows into JS — this project has paid for that mistake
// before, see project_cancellation_adjustment_precompute.md) and excludes
// any VIN already on a known N-9 list. The rules.ts constants are
// inlined as numeric literals (trusted, TypeScript-typed as `number`,
// never user input — not a bound-param injection concern) rather than
// passed as $N params: a $N that's bound but only referenced in one of
// two conditionally-built WHERE clauses (see loadCeMrsGapList's "today"
// vs "overdue" split) makes Postgres unable to infer its type at all —
// "could not determine data type of parameter $N" — since type
// inference runs off the parsed query text, not the supplied value.
const MRS_DUE_DATE_CTE = `
  with mrs_base as (
    select l.vin, l.allocated_dealer, l.customer_first_name, l.customer_family_name,
           l.contact_number, l.vehicle_model, l.n_report_date, l.n_mileage,
           case
             when l.n1_report_date is not null and l.n1_mileage is not null
                  and (l.n_report_date - l.n1_report_date) > 0
                  and (l.n_mileage - l.n1_mileage)::numeric / (l.n_report_date - l.n1_report_date) >= ${CE_MIN_PLAUSIBLE_KM_PER_DAY}
               then (l.n_mileage - l.n1_mileage)::numeric / (l.n_report_date - l.n1_report_date)
             when l.sales_date is not null and (l.n_report_date - l.sales_date) > 0
                  and l.n_mileage::numeric / (l.n_report_date - l.sales_date) >= ${CE_MIN_PLAUSIBLE_KM_PER_DAY}
               then l.n_mileage::numeric / (l.n_report_date - l.sales_date)
             else null
           end as rate
    from ce_leads l
    where l.active and l.n_mileage is not null and l.sales_date is not null and l.n_report_date is not null
  ),
  mrs_due as (
    select *,
      (n_report_date + ${CE_DUE_MONTHS} * interval '1 month')::date as months_due,
      case when rate is not null then (n_report_date + (${CE_DUE_KM}::numeric / rate) * interval '1 day')::date end as km_due
    from mrs_base
  ),
  mrs_final as (
    select vin, allocated_dealer, customer_first_name, customer_family_name, contact_number,
           vehicle_model, n_report_date, n_mileage,
           case when km_due is not null and km_due < months_due then km_due else months_due end as due_date
    from mrs_due
  )
`;

function addDaysIso(dateIso: string, days: number): string {
  return new Date(Date.parse(`${dateIso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** The daily MRS catch-list, split into two priorities (confirmed with
 * the user 2026-11-02): "priority" (due CE_MRS_PRIORITY_LEAD_DAYS from
 * now — not today; matches TKM's own N-7 call day, see that constant's
 * comment in rules.ts — the actual daily worklist) and "overdue" (due
 * date already passed, within the CE_MRS_WINDOW_DAYS lookback —
 * secondary, worked through if time allows). Anything due sooner than
 * the priority lead time, or due further out, is deliberately never
 * shown here — not useful to know about yet, per the user. Never on any
 * N-9 list we've imported — see project_mrs_n9_system.md for why
 * "overdue" is bounded to a lookback rather than "ever overdue" (the
 * proxy alone flags ~half of all active leads once the whole
 * reactivation backlog counts). */
export async function loadCeMrsGapList(options: {
  today: string;
  section: "priority" | "overdue";
  /** Splits each section into its own sub-section (added 2026-11-03 at
   * the user's request): "new" is leads never yet contacted (status =
   * 'New') — what a CE should work first — "followup" is everything
   * already attempted at least once. Keeps the two from interleaving in
   * one list, which otherwise forced scrolling past already-called rows
   * to find the next fresh one. */
  stage: "new" | "followup";
  query?: string;
  dealers?: string[];
  statuses?: CeStatus[];
  brand?: CeVehicleBrand;
  /** Scopes to one CE agent's own leads (ce_lead_workflow.assigned_to) —
   * omit for a head/hq view of everyone's. */
  assignedTo?: string;
  page?: number;
  limit?: number;
}) {
  const values: unknown[] = [options.today];
  const sectionClause = options.section === "priority"
    ? `f.due_date = $1::date + ${CE_MRS_PRIORITY_LEAD_DAYS} * interval '1 day'`
    : `f.due_date between $1::date - ${CE_MRS_WINDOW_DAYS} * interval '1 day' and $1::date - interval '1 day'`;
  const stageClause = options.stage === "new" ? `w.status = 'New'` : `w.status <> 'New'`;
  values.push([...CE_MRS_RESOLVED_STATUSES]);
  const resolvedStatusParam = values.length;
  const where = [
    sectionClause,
    stageClause,
    // Once a lead is resolved (an appointment's already booked, or it's
    // closed out one way or another) there's nothing left for this catch
    // list to chase — drop it instead of showing it as if still due.
    `not (w.status = any($${resolvedStatusParam}::text[]))`,
    `not exists (select 1 from n9_leads n where n.vin = f.vin)`,
  ];
  if (options.assignedTo) {
    values.push(options.assignedTo);
    where.push(`w.assigned_to = $${values.length}`);
  }
  if (options.query) {
    values.push(`%${options.query}%`);
    where.push(`(f.vin ilike $${values.length} or concat_ws(' ', f.customer_first_name, f.customer_family_name) ilike $${values.length} or f.contact_number ilike $${values.length} or f.vehicle_model ilike $${values.length})`);
  }
  if (options.dealers?.length) {
    values.push(options.dealers);
    where.push(`f.allocated_dealer = any($${values.length}::text[])`);
  }
  if (options.statuses?.length) {
    values.push(options.statuses);
    where.push(`w.status = any($${values.length}::text[])`);
  }
  if (options.brand) {
    values.push(LEXUS_VIN_WMI_PREFIXES.map((prefix) => `${prefix}%`));
    const lexusMatch = `left(f.vin, 3) like any($${values.length}::text[])`;
    where.push(options.brand === "lexus" ? lexusMatch : `not (${lexusMatch})`);
  }
  const clause = where.join(" and ");
  const page = Math.max(1, options.page ?? 1);
  const limit = options.limit ?? 50;
  const filterValues = [...values];
  values.push(limit, (page - 1) * limit);

  const resolvedStatusesArray = [...CE_MRS_RESOLVED_STATUSES];
  const stageCountValues: unknown[] = [options.today, resolvedStatusesArray];
  let stageCountAssignedClause = "";
  if (options.assignedTo) {
    stageCountValues.push(options.assignedTo);
    stageCountAssignedClause = `and w.assigned_to = $${stageCountValues.length}`;
  }

  const [list, countRow, sectionCounts, stageCounts, dealers] = await Promise.all([
    pool.query(
      `${MRS_DUE_DATE_CTE}
       select f.vin, trim(concat_ws(' ', f.customer_first_name, f.customer_family_name)) customer_name,
         f.allocated_dealer, f.n_report_date, f.n_mileage, f.due_date,
         w.status, w.next_follow_up_date, w.attempt_count, f.contact_number, f.vehicle_model, w.assigned_to
       from mrs_final f join ce_lead_workflow w using (vin)
       where ${clause}
       order by f.due_date, f.vin
       limit $${values.length - 1} offset $${values.length}`,
      values,
    ),
    pool.query<{ count: string }>(
      `${MRS_DUE_DATE_CTE}
       select count(*) from mrs_final f join ce_lead_workflow w using (vin) where ${clause}`,
      filterValues,
    ),
    // Unfiltered (no search/dealer/status) tab counts, same pattern as
    // the AVF page's category tiles — just the two sections' raw sizes,
    // still excluding resolved leads so the tab badges match what's
    // actually listed underneath.
    pool.query<{ priority: string; overdue: string }>(
      `${MRS_DUE_DATE_CTE}
       select
         count(*) filter (where f.due_date = $1::date + ${CE_MRS_PRIORITY_LEAD_DAYS} * interval '1 day') priority,
         count(*) filter (where f.due_date between $1::date - ${CE_MRS_WINDOW_DAYS} * interval '1 day' and $1::date - interval '1 day') overdue
       from mrs_final f join ce_lead_workflow w using (vin)
       where not exists (select 1 from n9_leads n where n.vin = f.vin) and not (w.status = any($2::text[]))`,
      [options.today, resolvedStatusesArray],
    ),
    // New-vs-follow-up counts for the active section only (search/dealer/
    // brand/workflow-filter ignored, same as sectionCounts above), scoped
    // to the agent's own leads when assignedTo is set so the sub-tab
    // badges match what that agent's table actually shows.
    pool.query<{ new: string; followup: string }>(
      `${MRS_DUE_DATE_CTE}
       select
         count(*) filter (where ${sectionClause} and w.status = 'New') new,
         count(*) filter (where ${sectionClause} and w.status <> 'New') followup
       from mrs_final f join ce_lead_workflow w using (vin)
       where not exists (select 1 from n9_leads n where n.vin = f.vin)
         and not (w.status = any($2::text[])) ${stageCountAssignedClause}`,
      stageCountValues,
    ),
    loadCeDealers(true),
  ]);

  const rows: CeMrsListRow[] = list.rows.map((row) => ({
    vin: row.vin,
    customerName: row.customer_name || "Unnamed customer",
    allocatedDealer: row.allocated_dealer,
    nReportDate: dateOnly(row.n_report_date),
    nMileage: Number(row.n_mileage),
    dueDate: dateOnly(row.due_date),
    status: row.status,
    nextFollowUpDate: row.next_follow_up_date ? dateOnly(row.next_follow_up_date) : null,
    attemptCount: Number(row.attempt_count),
    contactNumber: row.contact_number,
    vehicleModel: row.vehicle_model,
    assignedTo: row.assigned_to,
  }));
  const total = Number(countRow.rows[0].count);
  return {
    rows,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / limit)),
    dealers,
    priorityCount: Number(sectionCounts.rows[0].priority),
    overdueCount: Number(sectionCounts.rows[0].overdue),
    newCount: Number(stageCounts.rows[0].new),
    followUpCount: Number(stageCounts.rows[0].followup),
    priorityDueDate: addDaysIso(options.today, CE_MRS_PRIORITY_LEAD_DAYS),
    overdueWindowStart: addDaysIso(options.today, -CE_MRS_WINDOW_DAYS),
  };
}

const CE_AVF_SQL = "((l.n_mileage - l.n1_mileage) / 10000.0)";

export async function loadCeAvfPage(options: {
  today: string;
  query?: string;
  categories?: CeAvfCategory[];
  statuses?: CeStatus[];
  dealers?: string[];
  followUps?: CeFollowUpFilter[];
  month?: number;
  year?: number;
  page?: number;
}) {
  const filterValues: unknown[] = [];
  const where = ["l.active"];
  if (options.query) {
    filterValues.push(`%${options.query}%`);
    where.push(`(l.vin ilike $${filterValues.length} or concat_ws(' ', l.customer_first_name, l.customer_family_name) ilike $${filterValues.length} or l.contact_number ilike $${filterValues.length} or l.vehicle_model ilike $${filterValues.length})`);
  }
  if (options.categories?.length) {
    const ranges = { red: `${CE_AVF_SQL} < 1`, yellow: `${CE_AVF_SQL} between 1 and 1.7`, green: `${CE_AVF_SQL} > 1.7`, unavailable: "l.n1_mileage is null" } as const;
    where.push(`(${options.categories.map((category) => ranges[category]).join(" or ")})`);
  }
  if (options.statuses?.length) {
    filterValues.push(options.statuses);
    where.push(`w.status = any($${filterValues.length}::text[])`);
  }
  if (options.dealers?.length) {
    filterValues.push(options.dealers);
    where.push(`l.allocated_dealer = any($${filterValues.length}::text[])`);
  }
  if (options.followUps?.length) {
    filterValues.push(options.today);
    const today = `$${filterValues.length}::date`;
    // Same "Appointment booked" exclusion as loadCeLeadPage above — see
    // its comment for why.
    const followUps = {
      due: `(w.next_follow_up_date <= ${today} and w.status not in ('Converted', 'Vehicle sold', 'Serviced elsewhere', 'Not interested', 'Unreachable', 'Appointment booked'))`,
      upcoming: `(w.next_follow_up_date > ${today} and w.status not in ('Converted', 'Vehicle sold', 'Serviced elsewhere', 'Not interested', 'Unreachable', 'Appointment booked'))`,
      none: "w.next_follow_up_date is null",
    } as const;
    where.push(`(${options.followUps.map((filter) => followUps[filter]).join(" or ")})`);
  }
  if (options.month) {
    filterValues.push(options.month);
    where.push(`extract(month from l.n_report_date)::int = $${filterValues.length}`);
  }
  if (options.year) {
    filterValues.push(options.year);
    where.push(`extract(year from l.n_report_date)::int = $${filterValues.length}`);
  }

  const clause = where.join(" and ");
  const page = Math.max(1, options.page ?? 1);
  const limit = 50;
  const listValues = [...filterValues, limit, (page - 1) * limit];
  const [list, total, counts, dealers, years] = await Promise.all([
    pool.query(
      `select l.vin, trim(concat_ws(' ', l.customer_first_name, l.customer_family_name)) customer_name,
        l.allocated_dealer, l.n_report_date, l.n_mileage, l.n1_mileage, ${CE_AVF_SQL} avf,
        case when l.n1_mileage is null then 'unavailable' when ${CE_AVF_SQL} < 1 then 'red' when ${CE_AVF_SQL} <= 1.7 then 'yellow' else 'green' end category,
        l.contact_number, l.vehicle_model,
        w.status, w.next_follow_up_date
       from ce_leads l join ce_lead_workflow w using (vin)
       where ${clause}
       order by avf nulls last, l.vin
       limit $${filterValues.length + 1} offset $${filterValues.length + 2}`,
      listValues,
    ),
    pool.query<{ count: string }>(
      `select count(*) from ce_leads l join ce_lead_workflow w using (vin) where ${clause}`,
      filterValues,
    ),
    pool.query<{ red: string; yellow: string; green: string; unavailable: string }>(
      `select count(*) filter (where avf < 1) red,
        count(*) filter (where avf between 1 and 1.7) yellow,
        count(*) filter (where avf > 1.7) green,
        count(*) filter (where avf is null) unavailable
       from (select case when n1_mileage is null then null else (n_mileage - n1_mileage) / 10000.0 end avf from ce_leads where active) values_by_lead`,
    ),
    loadCeDealers(true),
    loadCeReportYears(true),
  ]);

  const rows: CeAvfListRow[] = list.rows.map((row) => ({
    vin: row.vin,
    customerName: row.customer_name || "Unnamed customer",
    allocatedDealer: row.allocated_dealer,
    nReportDate: dateOnly(row.n_report_date),
    nMileage: Number(row.n_mileage),
    n1Mileage: row.n1_mileage === null ? null : Number(row.n1_mileage),
    avf: row.avf === null ? null : Number(row.avf),
    category: row.category,
    status: row.status,
    nextFollowUpDate: row.next_follow_up_date ? dateOnly(row.next_follow_up_date) : null,
    contactNumber: row.contact_number,
    vehicleModel: row.vehicle_model,
  }));
  const totalCount = Number(total.rows[0].count);
  return {
    rows,
    total: totalCount,
    page,
    pageCount: Math.max(1, Math.ceil(totalCount / limit)),
    counts: {
      red: Number(counts.rows[0].red),
      yellow: Number(counts.rows[0].yellow),
      green: Number(counts.rows[0].green),
      unavailable: Number(counts.rows[0].unavailable),
    },
    dealers,
    years,
  };
}

export async function loadCeLead(vin: string, today: string): Promise<{ lead: CeLeadDetail; activity: CeActivity[] } | null> {
  const [leadResult, activityResult] = await Promise.all([
    pool.query(
      `select l.*, w.status, w.next_follow_up_date, w.attempt_count, w.latest_call_status,
        w.latest_outcome, w.last_editor, w.updated_at, w.assigned_to, i.source_file_name,
        d.source_file_name dms_source_file_name, d.uploaded_at dms_imported_at,
        ($2::date - l.n_report_date)::int age_days,
        case when ($2::date - l.n_report_date) <= 364 then 'hot' when ($2::date - l.n_report_date) <= 730 then 'warm' else 'cold' end category
       from ce_leads l join ce_lead_workflow w using (vin) join ce_lead_imports i on i.id = l.source_import_id
       left join ce_lead_imports d on d.id = l.dms_import_id
       where l.vin = $1`,
      [vin, today],
    ),
    pool.query("select * from ce_lead_activity where vin = $1 order by created_at desc, id desc", [vin]),
  ]);
  const row = leadResult.rows[0];
  if (!row) return null;
  return {
    lead: {
      allocatedDealer: row.allocated_dealer,
      dealerZone: row.dealer_zone,
      vin: row.vin,
      saleDealerCode: row.sale_dealer_code,
      salesDate: dateOnly(row.sales_date),
      uioYear: Number(row.uio_year),
      saleBranchCode: row.sale_branch_code,
      nDealerCode: row.n_dealer_code,
      avf: row.avf === null ? null : Number(row.avf),
      nReportDate: dateOnly(row.n_report_date),
      nMileage: Number(row.n_mileage),
      n1DealerCode: row.n1_dealer_code,
      n1ReportDate: row.n1_report_date ? dateOnly(row.n1_report_date) : null,
      n1Mileage: row.n1_mileage === null ? null : Number(row.n1_mileage),
      n2DealerCode: row.n2_dealer_code,
      n2Mileage: row.n2_mileage === null ? null : Number(row.n2_mileage),
      n2ReportDate: row.n2_report_date ? dateOnly(row.n2_report_date) : null,
      customerFirstName: row.customer_first_name,
      customerFamilyName: row.customer_family_name,
      contactNumber: row.contact_number,
      vehicleModel: row.vehicle_model,
      active: row.active,
      status: row.status,
      nextFollowUpDate: row.next_follow_up_date ? dateOnly(row.next_follow_up_date) : null,
      attemptCount: Number(row.attempt_count),
      latestCallStatus: row.latest_call_status,
      latestOutcome: row.latest_outcome,
      lastEditor: row.last_editor,
      updatedAt: new Date(row.updated_at).toISOString(),
      sourceFileName: row.source_file_name,
      importedAt: new Date(row.imported_at).toISOString(),
      ageDays: Number(row.age_days),
      category: row.category,
      dmsSourceFileName: row.dms_source_file_name,
      dmsImportedAt: row.dms_imported_at ? new Date(row.dms_imported_at).toISOString() : null,
      assignedTo: row.assigned_to,
    },
    activity: activityResult.rows.map((item) => ({
      id: String(item.id),
      previousStatus: item.previous_status,
      status: item.status,
      nextFollowUpDate: item.next_follow_up_date ? dateOnly(item.next_follow_up_date) : null,
      note: item.note,
      attemptNumber: item.attempt_number === null ? null : Number(item.attempt_number),
      callStatus: item.call_status,
      outcome: item.outcome,
      author: item.author,
      createdAt: new Date(item.created_at).toISOString(),
    })),
  };
}

export async function updateCeLead(input: {
  vin: string;
  callStatus: string;
  outcome: string;
  nextFollowUpDate: string | null;
  note: string;
  username: string;
  /** Set only for a ce_agent caller — asserts the lead is actually assigned
   * to them (the UI already only offers the call form for an agent's own
   * leads via loadCeLead's notFound() check, but a direct form POST could
   * otherwise bypass that). Omit for ce_head/hq, who can edit any lead. */
  requireAssignedTo?: string;
}) {
  if (!input.note.trim()) throw new Error("What the customer said is required.");
  if (input.note.length > 2_000) throw new Error("Keep the customer response to 2,000 characters or fewer.");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query<{ active: boolean; status: CeStatus; attempt_count: number; assigned_to: string | null }>(
      `select l.active, w.status, w.attempt_count, w.assigned_to from ce_leads l join ce_lead_workflow w using (vin) where l.vin = $1 for update of w`,
      [input.vin],
    );
    if (!current.rows[0]) throw new Error("Lead not found.");
    if (!current.rows[0].active) throw new Error("Archived leads are read-only.");
    if (input.requireAssignedTo && current.rows[0].assigned_to !== input.requireAssignedTo) throw new Error("This lead isn't assigned to you.");
    const next = deriveCeCallUpdate({
      currentAttemptCount: Number(current.rows[0].attempt_count),
      callStatus: input.callStatus,
      outcome: input.outcome,
      followUpDate: input.nextFollowUpDate,
      today: indiaDate(),
    });
    await client.query(
      `update ce_lead_workflow set status = $2, next_follow_up_date = $3, attempt_count = $4,
       latest_call_status = $5, latest_outcome = $6, last_editor = $7, updated_at = now() where vin = $1`,
      [input.vin, next.status, next.nextFollowUpDate, next.attemptCount, next.callStatus, next.outcome, input.username],
    );
    await client.query(
      `insert into ce_lead_activity
       (vin, previous_status, status, next_follow_up_date, note, attempt_number, call_status, outcome, author)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [input.vin, current.rows[0].status, next.status, next.nextFollowUpDate, input.note.trim(), next.attemptCount, next.callStatus, next.outcome, input.username],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export type CeServiceHistoryVisit = {
  date: string;
  branch: string;
  jobOrderNo: string | null;
  mileage: number | null;
  jobLines: string[];
  reportType: "service_info" | "service_info_bp";
};

/** "What they did when they came" (2026-11-02, at the user's request): the
 * Service timeline on a lead's detail page only ever had date/mileage/dealer
 * per N/N1/N2 visit — the actual job lines only exist in the Service Info
 * Report's raw rows (one row per job code on a repair order), uploaded
 * separately from the N/N1/N2 chain and never retained anywhere else. Relies
 * on raw_upload_rows_service_info_vin_idx (see schema.sql) — without it this
 * is a full scan of ~900k Service Info rows per lead page load. Grouped by
 * (date, branch, RO) since one visit spans several job-line rows; capped to
 * the 15 most recent ROs on file, most recent first, so a high-mileage
 * vehicle with years of history doesn't blow up the page. */
export async function loadCeLeadServiceHistory(vin: string): Promise<CeServiceHistoryVisit[]> {
  const { rows } = await pool.query<{ date: string; branch: string; report_type: "service_info" | "service_info_bp"; ro: string | null; job_desc: string | null; mileage_raw: string | null }>(
    `select date::text as date, branch, report_type, row_data->>'Job Order No' as ro, row_data->>'Job Desc' as job_desc,
            coalesce(nullif(row_data->>'Mileage Out', ''), nullif(row_data->>'Mileage In', '')) as mileage_raw
     from raw_upload_rows
     where report_type in ('service_info', 'service_info_bp') and upper(trim(row_data->>'Vin no')) = $1
     order by date desc, row_index`,
    [vin],
  );

  const visits = new Map<string, CeServiceHistoryVisit>();
  for (const row of rows) {
    const key = `${row.date}#${row.branch}#${row.ro ?? ""}#${row.report_type}`;
    const desc = (row.job_desc ?? "").trim();
    let visit = visits.get(key);
    if (!visit) {
      const mileageNum = row.mileage_raw ? Number(row.mileage_raw.replace(/,/g, "")) : NaN;
      visit = { date: row.date, branch: row.branch, jobOrderNo: row.ro || null, mileage: Number.isFinite(mileageNum) ? mileageNum : null, jobLines: [], reportType: row.report_type };
      visits.set(key, visit);
    }
    if (desc && !visit.jobLines.includes(desc)) visit.jobLines.push(desc);
  }

  return [...visits.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
}

/** The CE head's "Assign evenly" bulk action on /ce/mrs (2026-11-02, at the
 * user's request): round-robins the given VINs across the given agent
 * usernames in order — agent[0] gets vins[0], agent[1] gets vins[1], etc.,
 * wrapping around. Caller (the server action) owns picking which VINs
 * (checkbox-selected, not "everything currently filtered") and which agents
 * (every ce_agent reporting to this head — see admin-store.ts's listCeAgents).
 * Re-assigning an already-assigned lead is allowed — it simply overwrites
 * assigned_to, no history kept (assignment isn't a workflow status, so it
 * doesn't go through ce_lead_activity). */
export async function assignCeLeadsEvenly(input: { vins: string[]; agents: string[] }): Promise<{ assignedCount: number }> {
  if (input.vins.length === 0 || input.agents.length === 0) return { assignedCount: 0 };
  const assignments = input.vins.map((vin, i) => ({ vin, assigned_to: input.agents[i % input.agents.length] }));
  await pool.query(
    `update ce_lead_workflow w set assigned_to = a.assigned_to
     from jsonb_to_recordset($1::jsonb) as a(vin text, assigned_to text)
     where w.vin = a.vin`,
    [JSON.stringify(assignments)],
  );
  return { assignedCount: assignments.length };
}

