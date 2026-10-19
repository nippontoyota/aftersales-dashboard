import "server-only";
import { pool } from "@/lib/db";
import type { CeLeadInput, ParsedCeWorkbook } from "./parse";
import { deriveCeCallUpdate, indiaDate, type CeAvfCategory, type CeCallOutcome, type CeCallStatus, type CeCategory, type CeFollowUpFilter, type CeStatus } from "./rules";

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
    await client.query("update ce_leads set active = false where active and dms_import_id is null");

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
        sale_branch_code = excluded.sale_branch_code, n_dealer_code = excluded.n_dealer_code, avf = excluded.avf,
        n_report_date = excluded.n_report_date, n_mileage = excluded.n_mileage, n1_dealer_code = excluded.n1_dealer_code,
        n1_report_date = excluded.n1_report_date, n1_mileage = excluded.n1_mileage, n2_dealer_code = excluded.n2_dealer_code,
        n2_mileage = excluded.n2_mileage, n2_report_date = excluded.n2_report_date,
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
  month?: number;
  year?: number;
  page?: number;
}) {
  const values: unknown[] = [options.today, options.active];
  const where = ["l.active = $2"];
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
    const followUps = {
      due: "(w.next_follow_up_date <= $1::date and w.status not in ('Converted', 'Not interested', 'Unreachable'))",
      upcoming: "(w.next_follow_up_date > $1::date and w.status not in ('Converted', 'Not interested', 'Unreachable'))",
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
    const followUps = {
      due: `(w.next_follow_up_date <= ${today} and w.status not in ('Converted', 'Not interested', 'Unreachable'))`,
      upcoming: `(w.next_follow_up_date > ${today} and w.status not in ('Converted', 'Not interested', 'Unreachable'))`,
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
        w.latest_outcome, w.last_editor, w.updated_at, i.source_file_name,
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
}) {
  if (!input.note.trim()) throw new Error("What the customer said is required.");
  if (input.note.length > 2_000) throw new Error("Keep the customer response to 2,000 characters or fewer.");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query<{ active: boolean; status: CeStatus; attempt_count: number }>(
      `select l.active, w.status, w.attempt_count from ce_leads l join ce_lead_workflow w using (vin) where l.vin = $1 for update of w`,
      [input.vin],
    );
    if (!current.rows[0]) throw new Error("Lead not found.");
    if (!current.rows[0].active) throw new Error("Archived leads are read-only.");
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

