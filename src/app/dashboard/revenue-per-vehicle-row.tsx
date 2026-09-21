"use client";

import { useState } from "react";
import { formatCompact } from "@/lib/format";

/** Client half of revenue-per-vehicle-table.tsx (2026-09-21) — just the
 * BPU column's click-to-expand Parts/Labour split. Kept separate from the
 * table itself so the table can stay a Server Component and import
 * report.ts (BranchReport) without pulling the `pg` Postgres client into
 * the browser bundle. */
export function BpuCell({ combined, parts, labour }: { combined: number | null; parts: number | null; labour: number | null }) {
  const [open, setOpen] = useState(false);
  if (combined === null) {
    return <div className="w-20 whitespace-nowrap text-center text-sm text-fg-faint">—</div>;
  }
  return (
    <div className="w-24">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-end gap-1 whitespace-nowrap rounded text-sm font-semibold tabular-nums text-fg hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        title="Click to split Parts/Labour"
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className={`h-2.5 w-2.5 shrink-0 text-fg-faint transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden="true"
        >
          <path d="M5 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {formatCompact(combined)}
      </button>
      {open ? (
        <div className="mt-1 space-y-0.5 border-t border-dashed border-border pt-1 text-right text-[10px] text-fg-faint">
          <div>Parts {parts === null ? "—" : formatCompact(parts)}</div>
          <div>Labour {labour === null ? "—" : formatCompact(labour)}</div>
        </div>
      ) : null}
    </div>
  );
}
