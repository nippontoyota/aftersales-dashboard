"use client";

import { useRouter } from "next/navigation";
import { REGIONS } from "@/lib/regions";

export function RegionSelect({
  selected,
  date,
  basePath = "/dashboard",
  extraParams,
}: {
  selected: string;
  date: string;
  basePath?: string;
  /** Extra query params (e.g. /alerts' `watched=tkm`) to carry along on
   * every navigation — otherwise switching regions silently drops them. */
  extraParams?: Record<string, string>;
}) {
  const router = useRouter();
  const options = ["All", ...Object.keys(REGIONS)];

  return (
    <select
      value={selected}
      onChange={(e) => {
        const params = new URLSearchParams({ date, ...extraParams });
        if (e.target.value !== "All") params.set("region", e.target.value);
        router.push(`${basePath}?${params.toString()}`);
      }}
      className="h-8 rounded border border-border-strong px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {options.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </select>
  );
}
