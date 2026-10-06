import type { AchievementTone } from "@/lib/aggregate";
import { formatCompact, formatCompactCurrency, formatNumber, formatPercent } from "@/lib/format";

const TONE_TEXT = { good: "text-good", warn: "text-warn", critical: "text-bad", neutral: "text-fg-faint" } as const;

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
    </tr>
  );
}
