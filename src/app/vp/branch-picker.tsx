"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { control } from "@/lib/ui";

export function BranchPicker({
  groups,
  selected,
}: {
  groups: { region: string; branches: string[] }[];
  selected: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  return (
    <select
      value={selected ?? ""}
      onChange={(e) => {
        const p = new URLSearchParams(params);
        if (e.target.value) p.set("branch", e.target.value);
        else p.delete("branch");
        router.push(`/vp/branches?${p.toString()}`);
      }}
      className={`${control} px-2`}
    >
      <option value="">Select a branch…</option>
      {groups.map((g) => (
        <optgroup key={g.region} label={g.region}>
          {g.branches.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
