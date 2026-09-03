import { pool } from "../db";

/** How a bill's taxable value is counted on the dashboard. Chosen on the
 * upload form; `null` on legacy rows means "not yet classified" — counted
 * toward neither revenue line. */
export type BillCategory = "scrap" | "used_oil";

export type BillUpload = {
  id: number;
  invoiceNumber: string;
  branch: string;
  taxableValue: number;
  category: BillCategory | null;
  sourceFileName: string;
  uploadedAt: string;
  uploadedBy: string;
  extractionMethod: "auto" | "manual";
};

/** Per-branch scrap / used-oil revenue for one calendar month (Asia/Kolkata),
 * summed from bill taxable values. Branches with no bills that month simply
 * don't appear — callers default them to 0. */
export type BillBranchRevenue = {
  branch: string;
  scrapRevenue: number;
  usedOilRevenue: number;
};

export type BillMonthTotal = {
  month: string;
  total: number;
  count: number;
  /** `total` split by category — scrapTotal + usedOilTotal + untaggedTotal === total. */
  scrapTotal: number;
  usedOilTotal: number;
  untaggedTotal: number;
};

export type BillListItem = {
  id: number;
  invoiceNumber: string;
  taxableValue: number;
  category: BillCategory | null;
  sourceFileName: string;
  uploadedAt: string;
};

type BillRow = {
  id: string;
  invoice_number: string;
  branch: string;
  taxable_value: string;
  category: string | null;
  source_file_name: string;
  uploaded_at: string;
  uploaded_by: string;
  extraction_method: string;
};

const BILL_COLUMNS =
  "id, invoice_number, branch, taxable_value, category, source_file_name, uploaded_at, uploaded_by, extraction_method";

function toBillUpload(row: BillRow): BillUpload {
  return {
    id: Number(row.id),
    invoiceNumber: row.invoice_number,
    branch: row.branch,
    taxableValue: Number(row.taxable_value),
    category: (row.category as BillCategory | null) ?? null,
    sourceFileName: row.source_file_name,
    uploadedAt: row.uploaded_at,
    uploadedBy: row.uploaded_by,
    extractionMethod: row.extraction_method as "auto" | "manual",
  };
}

export async function saveBillUpload(params: {
  invoiceNumber: string;
  branch: string;
  taxableValue: number;
  category: BillCategory;
  fileData: Buffer;
  sourceFileName: string;
  uploadedAt: string;
  uploadedBy: string;
  extractionMethod: "auto" | "manual";
}): Promise<BillUpload> {
  const { rows } = await pool.query<BillRow>(
    `insert into bill_uploads (invoice_number, branch, taxable_value, category, file_data, source_file_name, uploaded_at, uploaded_by, extraction_method)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning ${BILL_COLUMNS}`,
    [params.invoiceNumber, params.branch, params.taxableValue, params.category, params.fileData, params.sourceFileName, params.uploadedAt, params.uploadedBy, params.extractionMethod]
  );
  return toBillUpload(rows[0]);
}

export async function loadBillByInvoiceNumber(invoiceNumber: string): Promise<BillUpload | null> {
  const { rows } = await pool.query<BillRow>(
    `select ${BILL_COLUMNS} from bill_uploads where invoice_number = $1`,
    [invoiceNumber]
  );
  return rows[0] ? toBillUpload(rows[0]) : null;
}

export async function loadBillTotalsByMonth(branch?: string): Promise<BillMonthTotal[]> {
  const select = `select to_char(uploaded_at at time zone 'Asia/Kolkata', 'YYYY-MM') as month,
              sum(taxable_value) as total,
              count(*)::int as count,
              coalesce(sum(taxable_value) filter (where category = 'scrap'), 0)    as scrap_total,
              coalesce(sum(taxable_value) filter (where category = 'used_oil'), 0) as used_oil_total,
              coalesce(sum(taxable_value) filter (where category is null), 0)      as untagged_total
       from bill_uploads`;
  const query = branch
    ? `${select} where branch = $1 group by month order by month desc`
    : `${select} group by month order by month desc`;

  const { rows } = await pool.query<{
    month: string;
    total: string;
    count: number;
    scrap_total: string;
    used_oil_total: string;
    untagged_total: string;
  }>(query, branch ? [branch] : []);
  return rows.map((r) => ({
    month: r.month,
    total: Number(r.total),
    count: r.count,
    scrapTotal: Number(r.scrap_total),
    usedOilTotal: Number(r.used_oil_total),
    untaggedTotal: Number(r.untagged_total),
  }));
}

export async function loadBillsForMonth(month: string, branch?: string): Promise<BillListItem[]> {
  const query = branch
    ? `select id, invoice_number, taxable_value, category, source_file_name, uploaded_at
       from bill_uploads
       where to_char(uploaded_at at time zone 'Asia/Kolkata', 'YYYY-MM') = $1
         and branch = $2
       order by uploaded_at desc`
    : `select id, invoice_number, taxable_value, category, source_file_name, uploaded_at
       from bill_uploads
       where to_char(uploaded_at at time zone 'Asia/Kolkata', 'YYYY-MM') = $1
       order by uploaded_at desc`;

  const { rows } = await pool.query<{ id: string; invoice_number: string; taxable_value: string; category: string | null; source_file_name: string; uploaded_at: string }>(
    query,
    branch ? [month, branch] : [month]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    invoiceNumber: r.invoice_number,
    taxableValue: Number(r.taxable_value),
    category: (r.category as BillCategory | null) ?? null,
    sourceFileName: r.source_file_name,
    uploadedAt: r.uploaded_at,
  }));
}

export async function getBillById(id: number): Promise<BillUpload | null> {
  const { rows } = await pool.query<BillRow>(
    `select ${BILL_COLUMNS} from bill_uploads where id = $1`,
    [id]
  );
  return rows[0] ? toBillUpload(rows[0]) : null;
}

/** Scrap / used-oil revenue by branch for one `YYYY-MM` month (Asia/Kolkata),
 * from bill taxable values. Uncategorised bills (category null) are excluded.
 * Used by buildReport to fold bill revenue into each branch's Total Revenue
 * Stream — see report.ts. */
export async function loadBillRevenueByBranchForMonth(month: string): Promise<BillBranchRevenue[]> {
  const { rows } = await pool.query<{ branch: string; scrap: string; used_oil: string }>(
    `select branch,
            coalesce(sum(taxable_value) filter (where category = 'scrap'), 0)    as scrap,
            coalesce(sum(taxable_value) filter (where category = 'used_oil'), 0) as used_oil
     from bill_uploads
     where to_char(uploaded_at at time zone 'Asia/Kolkata', 'YYYY-MM') = $1
       and category is not null
     group by branch`,
    [month]
  );
  return rows.map((r) => ({
    branch: r.branch,
    scrapRevenue: Number(r.scrap),
    usedOilRevenue: Number(r.used_oil),
  }));
}

/** Same as loadBillRevenueByBranchForMonth but for a single `YYYY-MM-DD` day
 * (Asia/Kolkata) — the "for the day" scrap / used-oil figure on the branch
 * daily report. Bills carry only an upload timestamp, so this is "bills
 * uploaded on that calendar day", not "bills for work done that day". */
export async function loadBillRevenueByBranchForDate(date: string): Promise<BillBranchRevenue[]> {
  const { rows } = await pool.query<{ branch: string; scrap: string; used_oil: string }>(
    `select branch,
            coalesce(sum(taxable_value) filter (where category = 'scrap'), 0)    as scrap,
            coalesce(sum(taxable_value) filter (where category = 'used_oil'), 0) as used_oil
     from bill_uploads
     where (uploaded_at at time zone 'Asia/Kolkata')::date = $1::date
       and category is not null
     group by branch`,
    [date]
  );
  return rows.map((r) => ({
    branch: r.branch,
    scrapRevenue: Number(r.scrap),
    usedOilRevenue: Number(r.used_oil),
  }));
}

/** Fetches the raw PDF bytes for a bill — separate from getBillById to avoid
 * loading the (potentially large) bytea column when only metadata is needed. */
export async function getBillPdfData(id: number): Promise<Buffer | null> {
  const { rows } = await pool.query<{ file_data: Buffer }>(
    `select file_data from bill_uploads where id = $1`,
    [id]
  );
  return rows[0]?.file_data ?? null;
}
