import Link from "next/link";
import { achievementRatio, achievementTone, type HeroSummary, type KpiSummary } from "@/lib/aggregate";
import { formatCompact, formatCompactCurrency, formatPercent } from "@/lib/format";
import type { VpData } from "@/lib/vp-data";

/**
 * The company scoreboard — the "Service daily report" the VP gets in Excel,
 * rebuilt live. Metrics down the rows; Central / South / North / Group
 * across. Everything is month-to-date bar the two "for the day" RO counts.
 * VAS bill is our modelled figure (T-Gloss/Lexus jobs priced at list).
 *
 * Month-over-month / year-over-year rows are stubbed until the historical
 * baselines are wired in.
 */

type Col = { key: string; label: string; hero: HeroSummary; kpis: KpiSummary };
type Kind = "num" | "rs" | "pct";

type Row =
  | { kind: "group"; label: string }
  | { kind: "metric"; label: string; fmt: Kind; strong?: boolean; bar?: boolean; get: (c: Col) => number | null }
  | { kind: "stub"; label: string; note: string };

const ROWS: Row[] = [
  { kind: "group", label: "General Service (GUS)" },
  { kind: "metric", label: "RO billed — today", fmt: "num", get: (c) => c.hero.gusRoBilledForTheDay },
  { kind: "metric", label: "RO — MTD", fmt: "num", get: (c) => c.hero.gusRoMtd },
  { kind: "metric", label: "Parts — MTD", fmt: "rs", get: (c) => c.hero.gusPartsMtd },
  { kind: "metric", label: "Labour — MTD", fmt: "rs", get: (c) => c.hero.gusLabourMtd },

  { kind: "group", label: "Body & Paint (BPU)" },
  { kind: "metric", label: "RO billed — today", fmt: "num", get: (c) => c.hero.bpuRoBilledForTheDay },
  { kind: "metric", label: "RO — MTD", fmt: "num", get: (c) => c.hero.bpuRoMtd },
  { kind: "metric", label: "Parts — MTD", fmt: "rs", get: (c) => c.hero.bpuPartsMtd },
  { kind: "metric", label: "Labour — MTD", fmt: "rs", get: (c) => c.hero.bpuLabourMtd },

  { kind: "group", label: "VAS Bill · modelled" },
  { kind: "metric", label: "VAS bill — MTD", fmt: "rs", get: (c) => c.kpis.vasAchievementForTheMonth },
  { kind: "metric", label: "VAS bill — Target", fmt: "rs", get: (c) => c.kpis.vasBillTarget },
  { kind: "metric", label: "VAS achievement", fmt: "pct", bar: true, get: (c) => achievementRatio(c.kpis.vasAchievementForTheMonth, c.kpis.vasBillTarget) },

  { kind: "group", label: "Revenue Stream" },
  { kind: "metric", label: "External Sales — MTD", fmt: "rs", get: (c) => c.hero.externalSalesMtd },
  { kind: "metric", label: "Scrap Revenue — MTD", fmt: "rs", get: (c) => c.hero.scrapRevenueMtd },
  { kind: "metric", label: "Used Oil Revenue — MTD", fmt: "rs", get: (c) => c.hero.usedOilRevenueMtd },
  { kind: "metric", label: "Total Revenue — MTD", fmt: "rs", strong: true, get: (c) => c.hero.totalRevenueStreamMtd },

  { kind: "group", label: "Comparisons" },
  { kind: "stub", label: "vs last month", note: "needs last month's day-matched total" },
  { kind: "stub", label: "vs last year", note: "needs Sept 2025 data" },
];

function fmtValue(v: number | null, kind: Kind): string {
  if (v === null) return "—";
  if (kind === "pct") return formatPercent(v);
  if (kind === "rs") return formatCompactCurrency(v);
  return formatCompact(v);
}

const TONE_TEXT = { good: "text-good", warn: "text-warn", critical: "text-bad", neutral: "text-fg" } as const;
const TONE_BAR = { good: "bg-good-solid", warn: "bg-warn-solid", critical: "bg-bad-solid", neutral: "bg-border-strong" } as const;

export function VpScoreboard({ data, flagBase }: { data: VpData; flagBase: string }) {
  const cols: Col[] = [
    ...data.regions.map((r) => ({ key: r.region, label: r.region, hero: r.hero, kpis: r.kpis })),
    { key: "Group", label: "Group", hero: data.group.hero, kpis: data.group.kpis },
  ];

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
      <table className="w-full border-separate border-spacing-0 text-[13px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border-b border-border bg-surface py-2.5 pl-5 pr-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-faint">
              Metric
            </th>
            {cols.map((c) => (
              <th
                key={c.key}
                className={`border-b border-border px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.08em] ${
                  c.key === "Group" ? "bg-accent-soft/50 text-accent-text" : "text-fg-subtle"
                }`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row, i) => {
            if (row.kind === "group") {
              return (
                <tr key={`g${i}`}>
                  <td
                    colSpan={cols.length + 1}
                    className="border-t border-border bg-surface-2/70 py-2 pl-5 pr-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle"
                  >
                    <span className="border-l-2 border-accent pl-2">{row.label}</span>
                  </td>
                </tr>
              );
            }
            if (row.kind === "stub") {
              return (
                <tr key={`s${i}`} className="border-t border-border-subtle">
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-surface py-2 pl-5 pr-3 text-fg-muted">{row.label}</td>
                  <td colSpan={cols.length} className="px-4 py-2 text-right text-[11px] italic text-fg-faint">
                    coming soon — {row.note}
                  </td>
                </tr>
              );
            }
            return (
              <tr
                key={`m${i}`}
                className={`group/row border-t border-border-subtle transition-colors hover:bg-surface-2/40 ${
                  row.strong ? "bg-accent-soft/25" : ""
                }`}
              >
                <td
                  className={`sticky left-0 z-10 whitespace-nowrap py-2 pl-5 pr-3 ${row.strong ? "bg-accent-soft/25 font-semibold text-fg" : "bg-surface text-fg-muted"} group-hover/row:bg-surface-2/40`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {row.label}
                    <Link
                      href={`${flagBase}&flag=1&fmetric=${encodeURIComponent(row.label)}`}
                      title={`Raise a query about "${row.label}"`}
                      className="opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100 print:hidden"
                    >
                      <FlagGlyph />
                    </Link>
                  </span>
                </td>
                {cols.map((c) => {
                  const v = row.get(c);
                  const tone = row.fmt === "pct" ? achievementTone(v) : "neutral";
                  return (
                    <td
                      key={c.key}
                      className={`whitespace-nowrap px-4 py-2 text-right tabular-nums ${
                        c.key === "Group" ? "bg-accent-soft/30 font-semibold" : ""
                      } ${row.fmt === "pct" ? TONE_TEXT[tone] : "text-fg"}`}
                    >
                      {row.bar && v != null ? (
                        <span className="inline-flex items-center justify-end gap-2">
                          <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-surface-2 sm:inline-block">
                            <span className={`block h-full rounded-full ${TONE_BAR[tone]}`} style={{ width: `${Math.min(100, Math.round(v * 100))}%` }} />
                          </span>
                          {fmtValue(v, row.fmt)}
                        </span>
                      ) : (
                        fmtValue(v, row.fmt)
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FlagGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-fg-faint hover:text-accent-text" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M4 2v12M4 3h8l-1.5 2.5L12 8H4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
