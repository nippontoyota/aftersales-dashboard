"use client";

import { Fragment, useState } from "react";
import type { ReactNode } from "react";
import { achievementTone } from "@/lib/aggregate";
import { formatCompact, formatCompactCurrency, formatPercent } from "@/lib/format";

export type RegionTableRow = {
  branch: string;
  bodyPaintOnly: boolean;
  totalRevenue: number | null;
  rankTotal: { rank: number; of: number } | null;
  revenuePerCar: number | null;
  vasPct: number | null;
  gusRoMtd: number | null;
  bpuRoMtd: number | null;
};

const TONE_TEXT: Record<string, string> = {
  good: "text-good",
  warn: "text-warn",
  critical: "text-bad",
  neutral: "text-fg-faint",
};

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className={`h-3.5 w-3.5 shrink-0 text-fg-faint transition-transform ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RegionTable({ rows, bodies }: { rows: RegionTableRow[]; bodies: ReactNode[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (b: string) => setOpen((cur) => (cur === b ? null : b));

  return (
    <div className="rounded-lg border border-border bg-surface shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-fg-faint [&>th]:border-b [&>th]:border-border [&>th]:bg-surface-2 [&>th]:py-2">
              <th className="pl-4 pr-3 text-left font-medium">Branch</th>
              <th className="pl-3 text-right font-medium">Total Rev</th>
              <th className="pl-3 text-right font-medium">Rank</th>
              <th className="pl-3 text-right font-medium">Rev / car</th>
              <th className="pl-3 text-right font-medium">VAS %</th>
              <th className="pl-3 text-right font-medium">GUS RO</th>
              <th className="pl-3 pr-4 text-right font-medium">BPU RO</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isOpen = open === r.branch;
              return (
                <Fragment key={r.branch}>
                  <tr
                    tabIndex={0}
                    aria-expanded={isOpen}
                    onClick={() => toggle(r.branch)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(r.branch);
                      }
                    }}
                    className={`cursor-pointer [&>td]:border-b [&>td]:border-border-subtle [&>td]:py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                      isOpen ? "bg-violet-soft [&>td]:font-medium" : "hover:bg-surface-2"
                    }`}
                  >
                    <td className="whitespace-nowrap pl-4 pr-3">
                      <span className="flex items-center gap-1.5">
                        <Chevron open={isOpen} />
                        <span className="font-semibold tabular-nums text-fg">{r.branch}</span>
                        {r.bodyPaintOnly ? <span className="text-[9px] text-fg-faint">B&amp;P</span> : null}
                      </span>
                    </td>
                    <td className="whitespace-nowrap pl-3 text-right font-semibold tabular-nums text-fg">{formatCompactCurrency(r.totalRevenue)}</td>
                    <td className="whitespace-nowrap pl-3 text-right tabular-nums text-fg-faint">
                      {r.rankTotal ? `${r.rankTotal.rank}/${r.rankTotal.of}` : "—"}
                    </td>
                    <td className="whitespace-nowrap pl-3 text-right tabular-nums text-fg-subtle">
                      {r.bodyPaintOnly ? "—" : formatCompactCurrency(r.revenuePerCar)}
                    </td>
                    <td className={`whitespace-nowrap pl-3 text-right tabular-nums ${r.bodyPaintOnly ? "text-fg-faint" : TONE_TEXT[achievementTone(r.vasPct)]}`}>
                      {r.bodyPaintOnly ? "—" : formatPercent(r.vasPct)}
                    </td>
                    <td className="whitespace-nowrap pl-3 text-right tabular-nums text-fg-subtle">{formatCompact(r.gusRoMtd)}</td>
                    <td className="whitespace-nowrap pl-3 pr-4 text-right tabular-nums text-fg-subtle">{formatCompact(r.bpuRoMtd)}</td>
                  </tr>
                  {isOpen ? (
                    <tr>
                      <td colSpan={7} className="border-b border-border-subtle bg-canvas p-3 sm:p-4">
                        {bodies[i]}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
