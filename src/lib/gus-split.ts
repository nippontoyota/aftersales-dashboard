import { pool } from "./db";

/**
 * GUS repair-order composition, built from Service Info Report (GS) raw
 * rows — not from BA Tool's own GUS figure. Confirmed with the user
 * (2026-10-06, working CO01A October data by hand first) that Service
 * Info's own distinct-RO total runs a small amount off BA Tool's GUS MTD
 * (228 vs 227 for CO01A that month) — so this is deliberately its own
 * figure, shown alongside GUS rather than forced to reconcile against it.
 *
 * Classification is per repair order (every Job Desc line on that RO is
 * considered), with a fixed precedence so each RO lands in exactly one
 * bucket even when it carries lines from more than one category (e.g. a
 * Vcare 5,000 KM service plus an Accessories Installation on the same RO,
 * confirmed with the user on RO GSJ2616456 — PM wins):
 *
 *   1. PM           — any "<interval> KM SERVICE - INSP" line (the plain
 *                      Toyota periodic-service ladder), OR "Vcare - 5,000
 *                      KM SERVICE" (the only Vcare bracket that counts —
 *                      the user was explicit the other Vcare brackets,
 *                      e.g. 85,000/1,25,000/1,55,000 KM, do NOT count),
 *                      OR "ENGINE OIL - CHNG" (standalone oil-change
 *                      visit, confirmed PM too even with no interval line).
 *   2. PDI           — "PRE-DELIVERY SERVICE - INSP" (new-vehicle prep).
 *   3. Accessories    — "Accessories Installation", only when the RO has
 *                      no PM line (PM takes precedence per the confirmed
 *                      overlap rule above).
 *   4. General Repair — everything else — standalone repairs, body work,
 *                      warranty jobs, etc.
 *
 * A blank/missing "Job Order No" falls back to a per-row key (the raw
 * row's own id) so it still counts once and never silently merges with
 * another blank-Job-Order-No row — same defensive pattern as
 * service-info/parse.ts's brakeSkimmingRos set.
 */

export type GusSplitBreakdown = {
  pm: number;
  pdi: number;
  accessories: number;
  generalRepair: number;
  /** Distinct ROs in Service Info this month — NOT the same figure as BA
   * Tool's own GUS MTD (see module doc comment above); shown as its own
   * number, not reconciled against it. */
  total: number;
};

export const EMPTY_GUS_SPLIT: GusSplitBreakdown = { pm: 0, pdi: 0, accessories: 0, generalRepair: 0, total: 0 };

const PM_INTERVAL_RE = /^[0-9,]+ KM SERVICE - INSP$/;
const PM_VCARE_5K = "Vcare - 5,000 KM SERVICE";
const PM_ENGINE_OIL = "ENGINE OIL - CHNG";
const PDI_DESC = "PRE-DELIVERY SERVICE - INSP";
const ACCESSORIES_DESC = "Accessories Installation";

function isPmDesc(desc: string): boolean {
  return PM_INTERVAL_RE.test(desc) || desc === PM_VCARE_5K || desc === PM_ENGINE_OIL;
}

function classify(descs: Set<string>): keyof Omit<GusSplitBreakdown, "total"> {
  for (const d of descs) {
    if (isPmDesc(d)) return "pm";
  }
  if (descs.has(PDI_DESC)) return "pdi";
  if (descs.has(ACCESSORIES_DESC)) return "accessories";
  return "generalRepair";
}

/** GUS split for every branch with Service Info data in the given month, up
 * to and including `throughDate` — one query, bucketed in JS by branch so
 * the group/region rollups in ceo-data.ts can sum these per-branch
 * breakdowns rather than re-querying per scope. Branches with no Service
 * Info upload this month simply have no entry in the returned map. */
export async function loadGusSplitForMonth(throughDate: string): Promise<Map<string, GusSplitBreakdown>> {
  const monthStart = `${throughDate.slice(0, 7)}-01`;

  const { rows } = await pool.query<{ branch: string; job_order: string; descs: string[] }>(
    `select branch,
            coalesce(nullif(trim(row_data->>'Job Order No'), ''), 'row-' || id::text) as job_order,
            array_agg(distinct row_data->>'Job Desc') as descs
     from raw_upload_rows
     where report_type = 'service_info' and date >= $1 and date <= $2
     group by branch, job_order`,
    [monthStart, throughDate]
  );

  const byBranch = new Map<string, GusSplitBreakdown>();
  for (const row of rows) {
    const category = classify(new Set(row.descs));
    const current = byBranch.get(row.branch) ?? { ...EMPTY_GUS_SPLIT };
    current[category]++;
    current.total++;
    byBranch.set(row.branch, current);
  }
  return byBranch;
}

/** Sums per-branch breakdowns for a region/group rollup. */
export function sumGusSplits(splits: (GusSplitBreakdown | undefined)[]): GusSplitBreakdown {
  return splits.reduce<GusSplitBreakdown>(
    (acc, s) => ({
      pm: acc.pm + (s?.pm ?? 0),
      pdi: acc.pdi + (s?.pdi ?? 0),
      accessories: acc.accessories + (s?.accessories ?? 0),
      generalRepair: acc.generalRepair + (s?.generalRepair ?? 0),
      total: acc.total + (s?.total ?? 0),
    }),
    { ...EMPTY_GUS_SPLIT }
  );
}
