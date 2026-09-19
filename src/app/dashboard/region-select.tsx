"use client";

import { useRouter } from "next/navigation";
import { REGIONS, type RegionName } from "@/lib/regions";
import { control } from "@/lib/ui";

export function RegionSelect({
  selected,
  date,
  basePath = "/dashboard",
  extraParams,
  branches,
}: {
  selected: string;
  date: string;
  basePath?: string;
  /** Extra query params to carry along on
   * every navigation — otherwise switching regions silently drops them. */
  extraParams?: Record<string, string>;
  /** Branch codes present in the current report, grouped under their
   * region as individual options below the region-total option (2026-09-19,
   * at the user's request — the TKM Targets page). Omit to keep every other
   * page's plain All/Central/South/North dropdown exactly as it was. */
  branches?: string[];
}) {
  const router = useRouter();

  const navigate = (value: string) => {
    const params = new URLSearchParams({ date, ...extraParams });
    if (value !== "All") params.set("region", value);
    router.push(`${basePath}?${params.toString()}`);
  };

  if (!branches) {
    const options = ["All", ...Object.keys(REGIONS)];
    return (
      <select value={selected} onChange={(e) => navigate(e.target.value)} className={`${control} px-2`}>
        {options.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    );
  }

  const present = new Set(branches);
  return (
    <select value={selected} onChange={(e) => navigate(e.target.value)} className={`${control} px-2`}>
      <option value="All">All</option>
      {(Object.keys(REGIONS) as RegionName[]).map((region) => {
        const codes = REGIONS[region].filter((code) => present.has(code));
        if (codes.length === 0) return null;
        return (
          <optgroup key={region} label={region}>
            <option value={region}>{region} — all branches</option>
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
