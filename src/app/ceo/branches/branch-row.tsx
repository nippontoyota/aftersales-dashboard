import type { AchievementTone } from "@/lib/aggregate";
import type { GusSplitBreakdown } from "@/lib/gus-split";
import { formatCompact, formatCompactCurrency, formatNumber, formatPercent } from "@/lib/format";

const TONE_TEXT = { good: "text-good", warn: "text-warn", critical: "text-bad", neutral: "text-fg-faint" } as const;

/** Same category colours as gus-split-section.tsx's group-level bar, so the
 * branch row and the overview card read as the same chart at two scopes. */
const GUS_SPLIT_BAR: [key: keyof Omit<GusSplitBreakdown, "total">, cls: string][] = [
  ["pm", "bg-good-solid"],
  ["pdi", "bg-info-solid"],
  ["accessories", "bg-violet"],
  ["generalRepair", "bg-warn-solid"],
];

function GusSplitCell({ split }: { split: GusSplitBreakdown | undefined }) {
  if (!split || split.total === 0) return <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-fg-faint">—</td>;
  return (
    <td className="whitespace-nowrap px-4 py-2 text-right" title={`PM ${split.pm} · PDI ${split.pdi} · Accessories ${split.accessories} · General Repair ${split.generalRepair}`}>
      <div className="ml-auto h-1.5 w-20 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-border-subtle">
        <div className="flex h-full w-full">
          {GUS_SPLIT_BAR.map(([key, cls]) => {
            const pct = split[key] / split.total;
            return pct > 0 ? <div key={key} className={cls} style={{ width: `${pct * 100}%` }} /> : null;
          })}
        </div>
      </div>
      <div className="mt-0.5 text-[10.5px] tabular-nums text-fg-faint">
        {formatCompact(split.pm)} PM · {formatCompact(split.total)} total
      </div>
    </td>
  );
}

/**
 * One branch's row on /ceo/branches — all 13 figures (Revenue/Profit MTD,
 * then GS ROs/Utilization/Profit-RO/Revenue-RO, then the same four for BP,
 * then blended Revenue-RO, then GS/BP bay capacity + per-bay target) flat in
 * a single row (2026-10-01, at the user's request — replaced the earlier
 * click-to-expand detail panel with more columns instead; Revenue/RO sits
 * right next to Profit/RO for the same channel, also at the user's request).
 * Plain server-rendered row now; no client state needed since there's no
 * more expand/collapse interaction.
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
  gusSplit,
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
  gusSplit: GusSplitBreakdown | undefined;
}) {
  return (
    <tr className="border-t border-border-subtle hover:bg-surface-2/40">
      <td className="whitespace-nowrap py-2 pl-5 pr-3 font-semibold text-fg">{name}</td>
      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-fg">{formatCompactCurrency(revenueMtd)}</td>
      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-fg">{formatCompactCurrency(profitMtd)}</td>
      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-fg-subtle">{gsRos !== null ? formatCompact(gsRos) : "—"}</td>
      <td className={`whitespace-nowrap px-4 py-2 text-right tabular-nums font-semibold ${TONE_TEXT[gsTone]}`}>
        {gsUtilizationPct !== null ? formatPercent(gsUtilizationPct) : "—"}
      </td>
      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-fg-subtle">{formatCompactCurrency(gsProfitPerRo)}</td>
      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-fg-subtle">{formatCompactCurrency(gsRevenuePerRo)}</td>
      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-fg-subtle">{bpRos !== null ? formatCompact(bpRos) : "—"}</td>
      <td className={`whitespace-nowrap px-4 py-2 text-right tabular-nums font-semibold ${TONE_TEXT[bpTone]}`}>
        {bpUtilizationPct !== null ? formatPercent(bpUtilizationPct) : "—"}
      </td>
      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-fg-subtle">{formatCompactCurrency(bpProfitPerRo)}</td>
      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-fg-subtle">{formatCompactCurrency(bpRevenuePerRo)}</td>
      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-fg-subtle">{formatCompactCurrency(blendedRevenuePerRo)}</td>
      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-fg-subtle">
        {formatCompact(gsBays)} bays
        {gsTargetPerBayPerDay !== null ? ` · ${formatNumber(gsTargetPerBayPerDay)}/day` : ""}
      </td>
      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-fg-subtle">
        {formatCompact(bpBays)} bays
        {bpTargetPerBayPerDay !== null ? ` · ${formatNumber(bpTargetPerBayPerDay)}/day` : ""}
      </td>
      <GusSplitCell split={gusSplit} />
    </tr>
  );
}
