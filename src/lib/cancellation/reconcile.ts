import { pool } from "../db";

/**
 * Option A — the reconciliation check. For each cancelled invoice in a month,
 * decide whether its value is likely still sitting in that month's figures.
 *
 * Total Revenue is sourced from scom205 (Monthly KPI), which the DMS builds
 * net of any invoice cancelled *before* the export ran (confirmed with the
 * user). So a cancellation is a problem only when:
 *
 *   - it landed AFTER the branch's last scom205 upload for that month
 *     (`cancel_date` > that date) — the frozen monthly figure still has it; or
 *   - the cancelled invoice number is still literally present in the
 *     branch's SSRV089 data for the month (no replacement issued yet).
 *
 * SSRV089 only drives the Accessories deduction, not revenue directly — but
 * a stale invoice there is a strong tell that the cancellation hasn't
 * propagated. Body & Paint ROs (`BPE…`) aren't in SSRV089-General, so those
 * come back "unverified" — an honest "can't check from this data".
 */

export type ReconcileStatus =
  | "replaced" //  a different invoice now sits on the same RO — cancellation absorbed
  | "stale" //     the cancelled invoice number is still in SSRV089
  | "after_kpi_cutoff" // cancelled after the last scom205 pull this month
  | "unverified"; //   RO not in SSRV089 (BP job, or SSRV089 not uploaded)

export type ReconcileRow = {
  docNo: string;
  branch: string;
  refDocNo: string | null;
  cancelDate: string;
  cancelReason: string;
  regNo: string | null;
  ownerName: string | null;
  beforeTax: number;
  afterTax: number;
  status: ReconcileStatus;
  /** true when the value is likely still counted — the "needs a look" set. */
  flagged: boolean;
  lastKpiDate: string | null;
};

export type ReconcileResult = {
  month: string;
  rows: ReconcileRow[];
  flaggedCount: number;
  flaggedBeforeTax: number;
};

export async function reconcileCancellations(month: string, branch?: string): Promise<ReconcileResult> {
  const { rows } = await pool.query<{
    doc_no: string;
    branch: string;
    ref_doc_no: string | null;
    cancel_date: string;
    cancel_reason: string;
    reg_no: string | null;
    owner_name: string | null;
    before_tax: string;
    after_tax: string;
    last_kpi_date: string | null;
    after_last_kpi: boolean | null;
    has_replacement: boolean;
    still_present: boolean;
    ro_in_ssrv: boolean;
  }>(
    `
    with canc as (
      select doc_no, branch, ref_doc_no, cancel_date, cancel_reason, reg_no, owner_name, before_tax, after_tax,
             replace(doc_no, '-', '') as doc_key
      from invoice_cancellations
      where month = $1 ${branch ? "and branch = $2" : ""}
    ),
    ssrv as (
      select r.branch,
             replace(r.row_data->>'JobOrder No', '-', '') as ro,
             replace(coalesce(r.row_data->>'Invoice Doc No.', ''), '-', '') as inv
      from raw_upload_rows r
      where r.report_type = 'ssrv089'
        and to_char(r.date, 'YYYY-MM') = $1
    ),
    last_kpi as (
      select branch, max(date) as last_date
      from scom205_snapshots
      where to_char(date, 'YYYY-MM') = $1
      group by branch
    )
    select c.doc_no, c.branch, c.ref_doc_no, c.cancel_date::text as cancel_date, c.cancel_reason,
           c.reg_no, c.owner_name, c.before_tax, c.after_tax,
           lk.last_date::text as last_kpi_date,
           (lk.last_date is not null and c.cancel_date > lk.last_date) as after_last_kpi,
           exists (select 1 from ssrv s where s.branch = c.branch and s.ro = c.ref_doc_no and s.inv <> c.doc_key and s.ro is not null and s.ro <> '') as has_replacement,
           exists (select 1 from ssrv s where s.branch = c.branch and s.ro = c.ref_doc_no and s.inv = c.doc_key) as still_present,
           exists (select 1 from ssrv s where s.branch = c.branch and s.ro = c.ref_doc_no and s.ro is not null and s.ro <> '') as ro_in_ssrv
    from canc c
    left join last_kpi lk on lk.branch = c.branch
    order by c.branch, c.cancel_date, c.doc_no
    `,
    branch ? [month, branch] : [month],
  );

  const out: ReconcileRow[] = rows.map((r) => {
    let status: ReconcileStatus;
    if (r.still_present) status = "stale";
    else if (r.after_last_kpi) status = "after_kpi_cutoff";
    else if (r.has_replacement || r.ro_in_ssrv) status = "replaced";
    else status = "unverified";

    return {
      docNo: r.doc_no,
      branch: r.branch,
      refDocNo: r.ref_doc_no,
      cancelDate: r.cancel_date,
      cancelReason: r.cancel_reason,
      regNo: r.reg_no,
      ownerName: r.owner_name,
      beforeTax: Number(r.before_tax),
      afterTax: Number(r.after_tax),
      status,
      flagged: status === "stale" || status === "after_kpi_cutoff",
      lastKpiDate: r.last_kpi_date,
    };
  });

  const flagged = out.filter((r) => r.flagged);
  return {
    month,
    rows: out,
    flaggedCount: flagged.length,
    flaggedBeforeTax: flagged.reduce((s, r) => s + r.beforeTax, 0),
  };
}

/** Cheap count for the alerts/insights panel — "N cancellations may still be
 * in this month's figures", across every branch (or one). */
export async function countFlaggedCancellations(month: string, branch?: string): Promise<number> {
  const result = await reconcileCancellations(month, branch);
  return result.flaggedCount;
}
