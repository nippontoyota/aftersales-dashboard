"use client";

import { useState } from "react";
import type { AchievementTone } from "@/lib/aggregate";
import { formatCompact, formatCompactCurrency, formatNumber, formatPercent } from "@/lib/format";

const TONE_TEXT = { good: "text-good", warn: "text-warn", critical: "text-bad", neutral: "text-fg-faint" } as const;

/**
 * One branch's row on /ceo/branches, plus a click-to-expand detail panel for
 * Revenue/RO and bay-capacity figures (2026-10-01) — kept out of the main
 * row (already 9 columns) via the same expand/collapse interaction already
 * used on the TKM Targets heatmap (branch-performance-heatmap.tsx's
 * ExpandIcon/toggle pattern). All figures are computed server-side in
 * page.tsx and passed down as plain numbers — functions can't cross the
 * server/client boundary as props (see branch-performance-heatmap.tsx's
 * branchNames prop for the same lesson).
 */
export function BranchRow({
  name,
  revenueMtd,
  profitMtd,
  gsRos,
  gsUtilizationPct,
  gsTone,
  gsProfitPerRo,
  bpRos,
  bpUtilizationPct,
  bpTone,
  bpProfitPerRo,
  gsRevenuePerRo,
  bpRevenuePerRo,
  blendedRevenuePerRo,
  gsBays,
  bpBays,
  gsTargetPerBayPerDay,
  bpTargetPerBayPerDay,
}: {
  name: string;
  revenueMtd: number | null;
  profitMtd: number | null;
  gsRos: number | null;
  gsUtilizationPct: number | null;
  gsTone: AchievementTone;
  gsProfitPerRo: number | null;
  bpRos: number | null;
  bpUtilizationPct: number | null;
  bpTone: AchievementTone;
  bpProfitPerRo: number | null;
  gsRevenuePerRo: number | null;
  bpRevenuePerRo: number | null;
  blendedRevenuePerRo: number | null;
  gsBays: number;
  bpBays: number;
  gsTargetPerBayPerDay: number | null;
  bpTargetPerBayPerDay: number | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr className="border-t border-border-subtle hover:bg-surface-2/40">
        <td className="whitespace-nowrap py-2 pl-5 pr-3 font-semibold text-fg">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded hover:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            title={`${name} — click for Revenue/RO and bay-capacity detail`}
          >
            <svg viewBox="0 0 10 10" className={`h-2.5 w-2.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true">
              <path d="M3 1.5 L7 5 L3 8.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {name}
          </button>
        </td>
        <td className="px-4 py-2 text-right tabular-nums text-fg">{formatCompactCurrency(revenueMtd)}</td>
        <td className="px-4 py-2 text-right tabular-nums text-fg">{formatCompactCurrency(profitMtd)}</td>
        <td className="px-4 py-2 text-right tabular-nums text-fg-subtle">{gsRos !== null ? formatCompact(gsRos) : "—"}</td>
        <td className={`px-4 py-2 text-right tabular-nums font-semibold ${TONE_TEXT[gsTone]}`}>
          {gsUtilizationPct !== null ? formatPercent(gsUtilizationPct) : "—"}
        </td>
        <td className="px-4 py-2 text-right tabular-nums text-fg-subtle">{formatCompactCurrency(gsProfitPerRo)}</td>
        <td className="px-4 py-2 text-right tabular-nums text-fg-subtle">{bpRos !== null ? formatCompact(bpRos) : "—"}</td>
        <td className={`px-4 py-2 text-right tabular-nums font-semibold ${TONE_TEXT[bpTone]}`}>
          {bpUtilizationPct !== null ? formatPercent(bpUtilizationPct) : "—"}
        </td>
        <td className="px-4 py-2 text-right tabular-nums text-fg-subtle">{formatCompactCurrency(bpProfitPerRo)}</td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={9} className="p-0">
            <div className="my-1 mx-3 grid grid-cols-2 gap-2 rounded-lg border border-border-subtle bg-surface p-3 sm:grid-cols-3 lg:grid-cols-5">
              <DetailStat label="GS Revenue/RO" value={formatCompactCurrency(gsRevenuePerRo)} />
              <DetailStat label="BP Revenue/RO" value={formatCompactCurrency(bpRevenuePerRo)} />
              <DetailStat label="Revenue/RO" value={formatCompactCurrency(blendedRevenuePerRo)} />
              <DetailStat label="GS Capacity" value={`${formatCompact(gsBays)} bays`} sub={gsTargetPerBayPerDay !== null ? `${formatNumber(gsTargetPerBayPerDay)} ROs/bay/day target` : "No target"} />
              <DetailStat label="BP Capacity" value={`${formatCompact(bpBays)} bays`} sub={bpTargetPerBayPerDay !== null ? `${formatNumber(bpTargetPerBayPerDay)} ROs/bay/day target` : "No target"} />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function DetailStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-border-subtle bg-surface-2 p-2.5">
      <div className="text-[10px] font-semibold tracking-wide text-fg-subtle">{label}</div>
      <div className="mt-1 text-sm font-semibold tabular-nums text-fg">{value}</div>
      {sub ? <div className="mt-0.5 text-[10px] text-fg-faint">{sub}</div> : null}
    </div>
  );
}
