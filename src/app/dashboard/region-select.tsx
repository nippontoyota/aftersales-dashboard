"use client";

import { useRouter } from "next/navigation";
import { REGIONS } from "@/lib/regions";

export function RegionSelect({ selected, date, basePath = "/dashboard" }: { selected: string; date: string; basePath?: string }) {
  const router = useRouter();
  const options = ["All", ...Object.keys(REGIONS)];

  return (
    <select
      value={selected}
      onChange={(e) => {
        const params = new URLSearchParams({ date });
        if (e.target.value !== "All") params.set("region", e.target.value);
        router.push(`${basePath}?${params.toString()}`);
      }}
      className="h-8 rounded border border-slate-300 px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
    >
      {options.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </select>
  );
}
