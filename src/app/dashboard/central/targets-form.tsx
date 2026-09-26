"use client";

import { useState, useTransition } from "react";
import { saveRegionRevenueTargetsAction } from "@/lib/region-targets/actions";
import { control } from "@/lib/ui";

type BranchTargetInput = { branch: string; label: string; gsTarget: number | null; bpTarget: number | null; extTarget: number | null };

function BranchTargetRow({ month, branch, label, gsTarget, bpTarget, extTarget }: { month: string } & BranchTargetInput) {
  const [gs, setGs] = useState(gsTarget !== null ? String(gsTarget) : "");
  const [bp, setBp] = useState(bpTarget !== null ? String(bpTarget) : "");
  const [ext, setExt] = useState(extTarget !== null ? String(extTarget) : "");
  const [isPending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData();
    formData.set("month", month);
    formData.set("branch", branch);
    formData.set("gsTarget", gs);
    formData.set("bpTarget", bp);
    formData.set("extTarget", ext);
    startTransition(async () => {
      await saveRegionRevenueTargetsAction(formData);
      setSavedAt(Date.now());
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-[100px_1fr_1fr_1fr_auto] items-center gap-2">
      <span className="text-[12px] font-medium text-fg">{label}</span>
      <input type="number" min="0" step="1" value={gs} onChange={(e) => setGs(e.target.value)} placeholder="GS target" className={`${control} text-[12px]`} />
      <input type="number" min="0" step="1" value={bp} onChange={(e) => setBp(e.target.value)} placeholder="BP target" className={`${control} text-[12px]`} />
      <input type="number" min="0" step="1" value={ext} onChange={(e) => setExt(e.target.value)} placeholder="Ext Sales target" className={`${control} text-[12px]`} />
      <button
        type="submit"
        disabled={isPending}
        className="h-8 rounded-md bg-accent px-3 text-[12px] font-medium text-on-accent hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Saving…" : savedAt ? "Saved" : "Save"}
      </button>
    </form>
  );
}

export function TargetsForm({ month, branches }: { month: string; branches: BranchTargetInput[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-[13px] font-medium text-fg">Set this month&apos;s GS / BP / Ext Sales targets</span>
        <svg
          className={`h-4 w-4 text-fg-faint transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded ? (
        <div className="mt-3 space-y-2 border-t border-border-subtle pt-3">
          <div className="grid grid-cols-[100px_1fr_1fr_1fr_auto] gap-2 text-[10px] font-medium uppercase tracking-wide text-fg-faint">
            <span>Branch</span>
            <span>GS Target</span>
            <span>BP Target</span>
            <span>Ext Sales Target</span>
            <span />
          </div>
          {branches.map((b) => (
            <BranchTargetRow key={b.branch} month={month} {...b} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
