"use client";

import { useRouter } from "next/navigation";
import { REGIONS, type RegionName } from "@/lib/regions";
import { control } from "@/lib/ui";

/** Branch-only filter for the SA Analytics section on /branches (2026-10-24,
 * at the user's request) — deliberately separate from the page's own region
 * selector, which scopes Revenue per Vehicle/Spare Parts KPI/Heatmap but
 * never touched SA Analytics (it always showed every branch regardless, all
 * 250+ SAs at once). */
export function SaBranchSelect({
  selected,
  date,
  basePath,
  extraParams,
  branches,
}: {
  selected: string;
  date: string;
  basePath: string;
  /** The page's own region filter, if set — carried along so picking an SA
   * branch doesn't silently reset it. */
  extraParams?: Record<string, string>;
  /** Every real branch code in today's report, unfiltered by the page's own
   * region selector — this control is independent of that one. */
  branches: string[];
}) {
  const router = useRouter();

  const navigate = (value: string) => {
    const params = new URLSearchParams({ date, ...extraParams });
    if (value !== "All") params.set("saBranch", value);
    router.push(`${basePath}?${params.toString()}`);
  };

  return (
    <select value={selected} onChange={(e) => navigate(e.target.value)} className={`${control} px-2`}>
      <option value="All">All branches</option>
      {(Object.keys(REGIONS) as RegionName[]).map((region) => {
        const codes = REGIONS[region].filter((code) => branches.includes(code));
        if (codes.length === 0) return null;
        return (
          <optgroup key={region} label={region}>
            {codes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}
