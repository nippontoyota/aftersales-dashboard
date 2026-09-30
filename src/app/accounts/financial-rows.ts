import { formatNumber } from "@/lib/format";
import { DAILY_REPORT_ROWS, type MetricDef, type RowDef } from "../dashboard/daily-report-rows";

/**
 * The Accounts view's row set — a curated subset of DAILY_REPORT_ROWS
 * (the app's one source of truth for revenue-stream metrics), trimmed to
 * what's actually money (Rs) rather than operational volume (RO counts,
 * Tyre/Battery units, DIY counts, etc). User-agreed scope (2026-09-12): GUS/
 * BPU parts & labour, External Sales, TGLOSS, Scrap/Used Oil, Total
 * Revenue. Reuses the same MetricDef objects (and so the exact same
 * branchCell/regionTotalCell math) rather than re-deriving anything — no
 * risk of drifting from what CEO/VP already show for the same figures.
 */
const FINANCIAL_LABELS = new Set([
  "GUS Parts MTD (Rs)",
  "GUS Labour MTD (Rs)",
  "BPU Parts MTD (Rs)",
  "BPU Labour MTD (Rs)",
  "External Sales MTD (Rs)",
  "TGLOSS",
  "Scrap Revenue (without tax)",
  "Used Oil Revenue (without tax)",
  "Total MTD (Rs)",
]);

const GROUP_LABELS = new Set(["GUS", "BPU", "Revenue Stream", "TGLOSS", "Scrap & Used Oil"]);

export const FINANCIAL_ROWS: RowDef[] = DAILY_REPORT_ROWS.filter(
  (row) => (row.kind === "group" && GROUP_LABELS.has(row.label)) || (row.kind === "metric" && FINANCIAL_LABELS.has(row.label)),
).filter((row, i, arr) => {
  // Drop a group header that ended up with no metric rows following it
  // (e.g. "Revenue Stream" only had "% on SPR I", which isn't in scope).
  if (row.kind !== "group") return true;
  const next = arr[i + 1];
  return next !== undefined && next.kind === "metric";
});

/**
 * Total Units Serviced (RO) · MTD = GUS RO + BPU RO summed. Not money, so it
 * was originally excluded from FINANCIAL_ROWS above — added back 2026-09-30
 * per the user's explicit request (accounts wants unit volume alongside
 * revenue). Synthetic: no single BA Tool field holds the combined figure, so
 * this isn't filtered from DAILY_REPORT_ROWS like everything else here —
 * mtd is computed directly off BranchReport. MTD only (no daily figure),
 * per the user's choice.
 */
const unitsServicedRow: MetricDef = {
  kind: "metric",
  label: "Total Units Serviced (RO) · MTD",
  strong: true,
  summable: true,
  fmt: formatNumber,
  today: () => null,
  mtd: (b) => (b.gusRoMtd == null && b.bpuRoMtd == null ? null : (b.gusRoMtd ?? 0) + (b.bpuRoMtd ?? 0)),
  target: () => null,
};

export const UNITS_SERVICED_ROWS: RowDef[] = [{ kind: "group", label: "Units Serviced" }, unitsServicedRow];
