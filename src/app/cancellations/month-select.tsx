"use client";

import { useRouter } from "next/navigation";
import { control } from "@/lib/ui";

const label = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
};

export function MonthSelect({
  months,
  selected,
  branch,
}: {
  months: string[];
  selected: string;
  branch?: string;
}) {
  const router = useRouter();
  return (
    <select
      value={selected}
      onChange={(e) => {
        const params = new URLSearchParams({ month: e.target.value });
        if (branch) params.set("branch", branch);
        router.push(`/cancellations?${params.toString()}`);
      }}
      className={`${control} px-2`}
    >
      {months.map((m) => (
        <option key={m} value={m}>
          {label(m)}
        </option>
      ))}
    </select>
  );
}

export function BranchSelect({
  branches,
  selected,
  month,
}: {
  branches: string[];
  selected: string;
  month: string;
}) {
  const router = useRouter();
  return (
    <select
      value={selected}
      onChange={(e) => {
        const params = new URLSearchParams({ month });
        if (e.target.value !== "All") params.set("branch", e.target.value);
        router.push(`/cancellations?${params.toString()}`);
      }}
      className={`${control} px-2`}
    >
      <option value="All">All branches</option>
      {branches.map((b) => (
        <option key={b} value={b}>
          {b}
        </option>
      ))}
    </select>
  );
}
