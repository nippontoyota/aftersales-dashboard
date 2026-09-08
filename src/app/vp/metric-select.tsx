"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { control } from "@/lib/ui";

export function MetricSelect({
  basePath,
  options,
  selected,
}: {
  basePath: string;
  options: { key: string; label: string }[];
  selected: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  return (
    <select
      value={selected}
      onChange={(e) => {
        const p = new URLSearchParams(params);
        p.set("metric", e.target.value);
        router.push(`${basePath}?${p.toString()}`);
      }}
      className={`${control} px-2`}
    >
      {options.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
