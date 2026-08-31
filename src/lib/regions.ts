/**
 * Branch → region grouping, as specified for the dashboard. A branch not
 * listed here (shouldn't happen with real BA Tool data) simply has no
 * region and is excluded from region filtering but still shows under "All".
 */
export const REGIONS = {
  // CO01C (online store) folds into CO01A's own figures — see
  // report.ts's ONLINE_STORE_PARENT_BRANCH — but stays listed here so its
  // contribution still counts toward Central's region/company totals in
  // trend charts. CO01D (Lexus) is deliberately absent — see report.ts's
  // DEACTIVATED_BRANCHES — its numbers shouldn't count anywhere.
  Central: ["CO01A", "CO01B", "CO01C", "CO01E", "MV01A", "KY01A"],
  South: ["TR01A", "TR01B", "TR01C", "KL01A", "KL01B", "PH01A"],
  North: ["TL01A", "KT01A", "KT01B", "TI01A", "IR01A", "TI01B", "TI01C"],
} as const;

export type RegionName = keyof typeof REGIONS;

export function regionForBranch(branch: string): RegionName | null {
  for (const region of Object.keys(REGIONS) as RegionName[]) {
    if ((REGIONS[region] as readonly string[]).includes(branch)) return region;
  }
  return null;
}
