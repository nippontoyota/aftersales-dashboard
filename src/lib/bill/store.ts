import { pool } from "../db";

export type BillUpload = {
  id: number;
  invoiceNumber: string;
  branch: string;
  taxableValue: number;
  sourceFileName: string;
  uploadedAt: string;
  uploadedBy: string;
  extractionMethod: "auto" | "manual";
};

export type BillMonthTotal = {
  month: string;
  total: number;
  count: number;
};

export type BillListItem = {
  id: number;
  invoiceNumber: string;
  taxableValue: number;
  sourceFileName: string;
  uploadedAt: string;
};

type BillRow = {
  id: string;
  invoice_number: string;
  branch: string;
  taxable_value: string;
  source_file_name: string;
  uploaded_at: string;
  uploaded_by: string;
  extraction_method: string;
};

function toBillUpload(row: BillRow): BillUpload {
  return {
    id: Number(row.id),
    invoiceNumber: row.invoice_number,
    branch: row.branch,
    taxableValue: Number(row.taxable_value),
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
  fileData: Buffer;
  sourceFileName: string;
  uploadedAt: string;
  uploadedBy: string;
  extractionMethod: "auto" | "manual";
}): Promise<BillUpload> {
  const { rows } = await pool.query<BillRow>(
    `insert into bill_uploads (invoice_number, branch, taxable_value, file_data, source_file_name, uploaded_at, uploaded_by, extraction_method)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id, invoice_number, branch, taxable_value, source_file_name, uploaded_at, uploaded_by, extraction_method`,
    [params.invoiceNumber, params.branch, params.taxableValue, params.fileData, params.sourceFileName, params.uploadedAt, params.uploadedBy, params.extractionMethod]
  );
  return toBillUpload(rows[0]);
}

export async function loadBillByInvoiceNumber(invoiceNumber: string): Promise<BillUpload | null> {
  const { rows } = await pool.query<BillRow>(
    `select id, invoice_number, branch, taxable_value, source_file_name, uploaded_at, uploaded_by, extraction_method from bill_uploads where invoice_number = $1`,
    [invoiceNumber]
  );
  return rows[0] ? toBillUpload(rows[0]) : null;
}

export async function loadBillTotalsByMonth(branch?: string): Promise<BillMonthTotal[]> {
  const query = branch
    ? `select to_char(uploaded_at at time zone 'Asia/Kolkata', 'YYYY-MM') as month,
              sum(taxable_value) as total,
              count(*)::int as count
       from bill_uploads
       where branch = $1
       group by month
       order by month desc`
    : `select to_char(uploaded_at at time zone 'Asia/Kolkata', 'YYYY-MM') as month,
              sum(taxable_value) as total,
              count(*)::int as count
       from bill_uploads
       group by month
       order by month desc`;

  const { rows } = await pool.query<{ month: string; total: string; count: number }>(
    query,
    branch ? [branch] : []
  );
  return rows.map((r) => ({ month: r.month, total: Number(r.total), count: r.count }));
}

export async function loadBillsForMonth(month: string, branch?: string): Promise<BillListItem[]> {
  const query = branch
    ? `select id, invoice_number, taxable_value, source_file_name, uploaded_at
       from bill_uploads
       where to_char(uploaded_at at time zone 'Asia/Kolkata', 'YYYY-MM') = $1
         and branch = $2
       order by uploaded_at desc`
    : `select id, invoice_number, taxable_value, source_file_name, uploaded_at
       from bill_uploads
       where to_char(uploaded_at at time zone 'Asia/Kolkata', 'YYYY-MM') = $1
       order by uploaded_at desc`;

  const { rows } = await pool.query<{ id: string; invoice_number: string; taxable_value: string; source_file_name: string; uploaded_at: string }>(
    query,
    branch ? [month, branch] : [month]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    invoiceNumber: r.invoice_number,
    taxableValue: Number(r.taxable_value),
    sourceFileName: r.source_file_name,
    uploadedAt: r.uploaded_at,
  }));
}

export async function getBillById(id: number): Promise<BillUpload | null> {
  const { rows } = await pool.query<BillRow>(
    `select id, invoice_number, branch, taxable_value, source_file_name, uploaded_at, uploaded_by, extraction_method from bill_uploads where id = $1`,
    [id]
  );
  return rows[0] ? toBillUpload(rows[0]) : null;
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
