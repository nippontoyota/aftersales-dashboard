"use client";

import { useRouter } from "next/navigation";

export function DateSelect({
  dates,
  selected,
  region,
  basePath = "/dashboard",
}: {
  dates: string[];
  selected: string;
  region: string;
  basePath?: string;
}) {
  const router = useRouter();
  return (
    <select
      value={selected}
      onChange={(e) => {
        const params = new URLSearchParams({ date: e.target.value });
        if (region !== "All") params.set("region", region);
        router.push(`${basePath}?${params.toString()}`);
      }}
      className="h-8 rounded border border-slate-300 px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
    >
      {dates.map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
    </select>
  );
}
