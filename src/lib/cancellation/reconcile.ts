import { pool } from "../db";
import { loadCrossMonthReplacements } from "./cross-month-replacement";

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
 *
 * A "stale" row closed by an Accessories-staff SA is worse than an ordinary
 * stale row: report.ts's Accessories deduction (see
 * ssrv089/cancellation-adjustment.ts) has its own fix for this now, but
 * that fix only runs for the exact revenue_month it targets — this flag
 * exists so a stale Accessories bill is never just a quiet "might still be
 * counted" the way a stale GS bill is (whose scom205-side revenue is
 * usually already correct at the DMS level, per the reconciliation's own
 * design). `accessoriesImpact` marks that stronger case explicitly.
 */

export type ReconcileStatus =
  | "adjusted" //  a same-RO replacement in a later month was found and excluded from that month's revenue — see cross-month-replacement.ts
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
  /** Only meaningful when status === "stale": the stale SSRV089 row was
   * closed by an Accessories-staff SA, so it's still being subtracted from
   * GUS Parts/Labour MTD (Total Revenue), not just sitting unresolved. */
  accessoriesImpact: boolean;
  /** ISO timestamp — the freshest scom205 read for the branch this month
   * (latest report date vs. last upload). Null when no scom205 on file. */
  lastKpiCutoff: string | null;
  /** Only set when status === "adjusted" — the replacement invoice found on
   * the same RO in a later month, and the Parts/Labour value excluded from
   * that month's revenue because of it. See cross-month-replacement.ts. */
  crossMonthReplacement?: { replacementDocNo: string; replacementMonth: string; partSale: number; labourSale: number };
};

export type ReconcileResult = {
  month: string;
  rows: ReconcileRow[];
  flaggedCount: number;
  flaggedBeforeTax: number;
};

export async function reconcileCancellations(month: string, branch?: string): Promise<ReconcileResult> {
  // Exclusive month-end bound for the raw_upload_rows date-range filter
  // below — `month` is "YYYY-MM", so Date.UTC's month index (0 = Jan) is
  // already one past it, landing on the 1st of the following month.
  const [y, m] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const monthEndExclusive = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

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
    last_kpi_cutoff: string | null;
    after_last_kpi: boolean | null;
    has_replacement: boolean;
    still_present: boolean;
    ro_in_ssrv: boolean;
    accessories_stale: boolean;
  }>(
    `
    with canc as (
      select doc_no, branch, ref_doc_no, cancel_date, cancel_reason, reg_no, owner_name, before_tax, after_tax,
             coalesce(cancel_at, cancel_date::timestamptz) as cancel_moment,
             -- The invoice's revenue counts in the month it was RAISED, so
             -- that's the scom205 whose refresh time matters — not the month
             -- it was cancelled in (an invoice raised in July, cancelled in
             -- August, is a concern for July's figure).
             coalesce(to_char(issue_date, 'YYYY-MM'), month) as revenue_month,
             replace(doc_no, '-', '') as doc_key
      from invoice_cancellations
      where month = $1 and ($2::text is null or branch = $2)
    ),
    ssrv as (
      select r.branch,
             replace(r.row_data->>'JobOrder No', '-', '') as ro,
             replace(coalesce(r.row_data->>'Invoice Doc No.', ''), '-', '') as inv,
             trim(coalesce(r.row_data->>'Close SA Name', '')) as close_sa_name
      from raw_upload_rows r
      -- date range, not to_char(r.date,'YYYY-MM') = $1 — see the identical
      -- fix + EXPLAIN ANALYZE numbers in ssrv089/cancellation-adjustment.ts
      -- (2026-09-19): the old string comparison couldn't use
      -- raw_upload_rows_lookup_idx's date column, forcing a scan of every
      -- SSRV089 row ever uploaded instead of just this month's.
      where r.report_type = 'ssrv089'
        and r.date >= $3::date
        and r.date < $4::date
    ),
    -- The branch's freshest Monthly-KPI (scom205) read per month: the row
    -- for the latest report date, and when we actually uploaded it. The DMS
    -- builds scom205 net of cancellations as of its own pull time, so a
    -- cancellation is only a concern if it happened after BOTH that report's
    -- as-of date and when we last uploaded a scom205 for that month (which
    -- catches a late re-pull filed under an earlier date).
    last_kpi as (
      select distinct on (branch, to_char(date, 'YYYY-MM'))
             branch, to_char(date, 'YYYY-MM') as kmonth,
             date as last_date, uploaded_at as last_uploaded
      from scom205_snapshots
      order by branch, to_char(date, 'YYYY-MM'), date desc, uploaded_at desc
    )
    select c.doc_no, c.branch, c.ref_doc_no, c.cancel_date::text as cancel_date, c.cancel_reason,
           c.reg_no, c.owner_name, c.before_tax, c.after_tax,
           greatest(lk.last_uploaded, lk.last_date::timestamptz)::text as last_kpi_cutoff,
           (lk.branch is not null and c.cancel_moment > greatest(lk.last_uploaded, lk.last_date::timestamptz)) as after_last_kpi,
           exists (select 1 from ssrv s where s.branch = c.branch and s.ro = c.ref_doc_no and s.inv <> c.doc_key and s.ro is not null and s.ro <> '') as has_replacement,
           exists (select 1 from ssrv s where s.branch = c.branch and s.ro = c.ref_doc_no and s.inv = c.doc_key) as still_present,
           exists (select 1 from ssrv s where s.branch = c.branch and s.ro = c.ref_doc_no and s.ro is not null and s.ro <> '') as ro_in_ssrv,
           exists (
             select 1 from ssrv s
             join accessories_staff a
               on a.branch = s.branch
              and lower(regexp_replace(a.name, '\\s+', ' ', 'g')) = lower(regexp_replace(s.close_sa_name, '\\s+', ' ', 'g'))
             where s.branch = c.branch and s.inv = c.doc_key
           ) as accessories_stale
    from canc c
    left join last_kpi lk on lk.branch = c.branch and lk.kmonth = c.revenue_month
    order by c.branch, c.cancel_date, c.doc_no
    `,
    [month, branch ?? null, monthStart, monthEndExclusive],
  );

  // Keyed by cancelledDocNo — cross-month-replacement.ts already dedupes by
  // replacement invoice, but a reconciliation row is per cancelled doc, so
  // this is looked up per doc, not per replacement.
  const crossMonthByDocNo = new Map((await loadCrossMonthReplacements()).map((r) => [r.cancelledDocNo, r]));

  const out: ReconcileRow[] = rows.map((r) => {
    const crossMonth = crossMonthByDocNo.get(r.doc_no);
    let status: ReconcileStatus;
    if (crossMonth) status = "adjusted";
    else if (r.still_present) status = "stale";
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
      accessoriesImpact: status === "stale" && r.accessories_stale,
      lastKpiCutoff: r.last_kpi_cutoff ? new Date(r.last_kpi_cutoff).toISOString() : null,
      crossMonthReplacement: crossMonth
        ? {
            replacementDocNo: crossMonth.replacementDocNo,
            replacementMonth: crossMonth.replacementMonth,
            partSale: crossMonth.partSale,
            labourSale: crossMonth.labourSale,
          }
        : undefined,
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
