"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { formatCompact, formatCompactCurrency, formatPercent } from "@/lib/format";
import type { CompareBranchData } from "./vp-compare-data";
import { MetricDetailModal, type MetricRequest } from "./vp-metric-detail";
import { ITEMS, METRICS, type ItemKey } from "./vp-metrics";

/**
 * Branch-vs-branch comparison (2026-09-28, at the VP's request — "he should
 * be able to compare a specific branch against another one based on
 * different numbers"). Pin 2–4 branches from the Regions / Slab tables (the
 * pin button in each branch cell), then "Compare" opens every figure on the
 * page for just those branches side by side. Everything is precomputed
 * server-side into `data` (see vp-compare-data.ts), so pinning and opening
 * never fetches anything.
 */
const MAX_PINNED = 4;

type CompareContextValue = {
  pinned: string[];
  toggle: (branch: string) => void;
  clear: () => void;
  openCompare: () => void;
  openMetric: (request: MetricRequest) => void;
  /** Every branch's precomputed figures — for popups that show a branch against the rest. */
  allBranches: CompareBranchData[];
};

/** All branches' compare data; empty outside a provider. */
export function useAllBranches(): CompareBranchData[] {
  return useContext(CompareContext)?.allBranches ?? [];
}

const CompareContext = createContext<CompareContextValue | null>(null);

export function VpCompareProvider({ data, children }: { data: Record<string, CompareBranchData>; children: ReactNode }) {
  const [pinned, setPinned] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [metricRequest, setMetricRequest] = useState<MetricRequest | null>(null);
  const openMetric = useCallback((request: MetricRequest) => setMetricRequest(request), []);

  const toggle = useCallback((branch: string) => {
    setPinned((p) => (p.includes(branch) ? p.filter((b) => b !== branch) : p.length >= MAX_PINNED ? p : [...p, branch]));
  }, []);
  const clear = useCallback(() => {
    setPinned([]);
    setOpen(false);
  }, []);
  const openCompare = useCallback(() => setOpen(true), []);

  const allBranches = useMemo(() => Object.values(data), [data]);
  const value = useMemo(
    () => ({ pinned, toggle, clear, openCompare, openMetric, allBranches }),
    [pinned, toggle, clear, openCompare, openMetric, allBranches]
  );

  return (
    <CompareContext.Provider value={value}>
      {children}
      <CompareBar pinned={pinned} onToggle={toggle} onClear={clear} onOpen={openCompare} />
      {open && pinned.length >= 2 ? <CompareModal branches={pinned.map((b) => data[b]).filter(Boolean)} onClose={() => setOpen(false)} /> : null}
      {metricRequest ? <MetricDetailModal request={metricRequest} all={allBranches} onClose={() => setMetricRequest(null)} /> : null}
    </CompareContext.Provider>
  );
}

type MetricTarget = Omit<MetricRequest, "value"> & { value: number | null };

/** A figure in a table cell that opens the "why is this what it is" detail. Falls back to plain content outside a provider. */
export function VpMetricButton({ target, className, title, children }: { target: MetricTarget; className?: string; title?: string; children: ReactNode }) {
  const ctx = useContext(CompareContext);
  if (!ctx) return <span className={className}>{children}</span>;
  return (
    <button
      type="button"
      onClick={() => ctx.openMetric(target)}
      title={title ?? `${target.branch ?? target.scope?.label} — ${METRICS[target.metric].label}: rank & detail`}
      className={`${className ?? ""} cursor-pointer transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
    >
      {children}
    </button>
  );
}

/** Makes a whole block (a hero card, one row of it) open the detail — clicks on buttons/links inside it keep their own behaviour. */
export function VpMetricArea({ target, className, children }: { target: MetricTarget; className?: string; children: ReactNode }) {
  const ctx = useContext(CompareContext);
  if (!ctx) return <div className={className}>{children}</div>;
  return (
    <div
      role="button"
      tabIndex={0}
      title={`${target.scope?.label ?? target.branch} — ${METRICS[target.metric].label}: branch breakdown`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, a")) return;
        ctx.openMetric(target);
      }}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          ctx.openMetric(target);
        }
      }}
      className={`${className ?? ""} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
    >
      {children}
    </div>
  );
}

/** The pin toggle shown next to a branch name in a table. Renders nothing
 * outside a provider or for a row that isn't a real branch. */
export function VpPinButton({ branch }: { branch: string }) {
  const ctx = useContext(CompareContext);
  if (!ctx) return null;
  const isPinned = ctx.pinned.includes(branch);
  const full = !isPinned && ctx.pinned.length >= MAX_PINNED;
  return (
    <button
      type="button"
      onClick={() => ctx.toggle(branch)}
      disabled={full}
      aria-pressed={isPinned}
      title={isPinned ? `Remove ${branch} from comparison` : full ? `Compare holds up to ${MAX_PINNED} branches` : `Add ${branch} to comparison`}
      className={`ml-2 inline-flex h-5 w-5 items-center justify-center rounded align-middle transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent print:hidden ${
        isPinned ? "bg-accent text-on-accent" : "text-fg-faint hover:bg-surface-2 hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent"
      }`}
    >
      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        {isPinned ? <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M8 3v10M3 8h10" strokeLinecap="round" />}
      </svg>
    </button>
  );
}

/** A table row's branch label with its pin button. The slab table's combined
 * "CO01B + CO01E" row pins as CO01B; the "All branches" total row isn't a
 * branch, so it gets no pin. */
export function VpBranchLabel({ label }: { label: string }) {
  if (label === "All branches") return <>{label}</>;
  const branch = label === "CO01B + CO01E" ? "CO01B" : label;
  return (
    <>
      {label}
      <VpPinButton branch={branch} />
    </>
  );
}

function CompareBar({
  pinned,
  onToggle,
  onClear,
  onOpen,
}: {
  pinned: string[];
  onToggle: (branch: string) => void;
  onClear: () => void;
  onOpen: () => void;
}) {
  if (pinned.length === 0) return null;
  return (
    <div className="fixed bottom-5 left-1/2 z-40 flex max-w-[calc(100vw-7rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 shadow-lg print:hidden">
      <span className="hidden text-[11px] text-fg-faint sm:inline">Compare</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {pinned.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => onToggle(b)}
            title={`Remove ${b}`}
            className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-fg hover:bg-border-subtle"
          >
            {b}
            <span aria-hidden="true" className="text-fg-faint">
              ×
            </span>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onOpen}
        disabled={pinned.length < 2}
        title={pinned.length < 2 ? "Pin at least 2 branches" : "Compare side by side"}
        className="rounded-full bg-accent px-3 py-1 text-[11px] font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50"
      >
        {pinned.length < 2 ? "Pin one more" : "Compare"}
      </button>
      <button type="button" onClick={onClear} className="text-[11px] text-fg-faint hover:text-fg">
        Clear
      </button>
    </div>
  );
}

type Kind = "currency" | "count" | "percent";
type Row = {
  label: string;
  kind: Kind;
  get: (d: CompareBranchData) => number | null;
  /** Add-on item rows: the count is `get`, this is its share of PM Actual — shown under the count and used for best/worst colouring (raw counts favour big branches). */
  pen?: (d: CompareBranchData) => number | null;
  /** Optional third line (e.g. DIY revenue). */
  extra?: (d: CompareBranchData) => string | null;
};
type Section = { title: string; rows: Row[] };

/** One row per add-on item: count, with its % of PM Actual beneath (and revenue where the item has one). */
function itemSection(title: string, keys: ItemKey[]): Section {
  const rows: Row[] = keys.map((key) => {
    const item = ITEMS[key];
    return {
      label: item.label,
      kind: "count" as const,
      get: (d) => item.count(d),
      pen: (d) => {
        const c = item.count(d);
        const den = item.denom(d);
        return c === null || den === null || den <= 0 ? null : c / den;
      },
      extra: item.revenue ? (d) => (item.revenue!(d) === null ? null : formatCompactCurrency(item.revenue!(d)!)) : undefined,
    };
  });
  return { title, rows };
}

const SECTIONS: Section[] = [
  {
    title: "Revenue · MTD",
    rows: [
      { label: "Total Revenue Stream", kind: "currency", get: (d) => d.totalRevenue },
      { label: "GUS Parts", kind: "currency", get: (d) => d.gusParts },
      { label: "GUS Labour", kind: "currency", get: (d) => d.gusLabour },
      { label: "BPU Parts", kind: "currency", get: (d) => d.bpuParts },
      { label: "BPU Labour", kind: "currency", get: (d) => d.bpuLabour },
      { label: "External Sales", kind: "currency", get: (d) => d.externalSales },
      { label: "TGLOSS", kind: "currency", get: (d) => d.tglossMtd },
      { label: "TGLOSS % of target", kind: "percent", get: (d) => (d.tglossMtd === null || !d.tglossTarget ? null : d.tglossMtd / d.tglossTarget) },
    ],
  },
  {
    title: "Volume · MTD",
    rows: [
      { label: "GUS RO", kind: "count", get: (d) => d.gusRo },
      { label: "BPU RO", kind: "count", get: (d) => d.bpuRo },
    ],
  },
  {
    title: "Per vehicle (Rs / car)",
    rows: [
      { label: "GUS Parts / car", kind: "count", get: (d) => d.gusPartsPerCar },
      { label: "GUS Labour / car", kind: "count", get: (d) => d.gusLabourPerCar },
      { label: "BPU / car", kind: "count", get: (d) => d.bpuPerCar },
      { label: "TGLOSS / GUS car", kind: "count", get: (d) => d.tglossPerGusCar },
    ],
  },
  {
    title: "Incentive slabs · % achieved",
    rows: [1, 2, 3, 4].map((n) => ({ label: `Slab ${n}`, kind: "percent" as const, get: (d: CompareBranchData) => d.slabs?.[n - 1].ratio ?? null })),
  },
  {
    title: "TKM targets · % achieved (this month)",
    rows: [
      { label: "BPU", kind: "percent", get: (d) => d.tkm.bpu },
      { label: "Offtake", kind: "percent", get: (d) => d.tkm.offtake },
      { label: "Parts Retail", kind: "percent", get: (d) => d.tkm.partsRetail },
      { label: "PM+OC", kind: "percent", get: (d) => d.tkm.pmOc },
      { label: "Engine Flush · % of PM (target 20%)", kind: "percent", get: (d) => d.tkm.engineFlushPen },
      { label: "Injector Cleaner · % of PM (target 20%)", kind: "percent", get: (d) => d.tkm.injectorCleanerPen },
      { label: "Tyre · % of target", kind: "percent", get: (d) => d.tkm.tyre },
      { label: "Tyre · % of PM", kind: "percent", get: (d) => d.tkm.tyrePen },
      { label: "Battery · % of target", kind: "percent", get: (d) => d.tkm.battery },
      { label: "Battery · % of PM", kind: "percent", get: (d) => d.tkm.batteryPen },
    ],
  },
  itemSection("GUS Labour add-ons · MTD", ["wheelAlignmentGs", "wheelBalancingGs", "brakeSkimmingGs", "evaporator"]),
  itemSection("BPU Labour add-ons · MTD (Body & Paint jobs)", ["wheelAlignmentBp", "wheelBalancingBp", "brakeSkimmingBp"]),
  itemSection("GUS Parts add-ons · MTD", ["engineFlush", "injectorCleaner", "brakeSpray", "tyre", "battery", "diy"]),
];

function format(value: number | null, kind: Kind): string {
  if (value === null) return "—";
  if (kind === "currency") return formatCompactCurrency(value);
  if (kind === "percent") return formatPercent(value);
  return formatCompact(value);
}

/** Every metric shown is "higher is better", so the leader/laggard read is uniform. */
function cellTone(value: number | null, values: (number | null)[]): string {
  if (value === null) return "text-fg-faint";
  const present = values.filter((v): v is number => v !== null);
  if (present.length < 2) return "text-fg";
  const max = Math.max(...present);
  const min = Math.min(...present);
  if (max === min) return "text-fg";
  if (value === max) return "text-emerald-400";
  if (value === min) return "text-red-400";
  return "text-fg";
}

function CompareModal({ branches, onClose }: { branches: CompareBranchData[]; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-fg-faint">Compare branches</div>
            <h2 className="mt-0.5 text-lg font-semibold text-fg">{branches.map((b) => b.branch).join(" vs ")}</h2>
            <p className="mt-0.5 text-[11px] text-fg-faint">Best value in each row is green, lowest is red — month-to-date, as of the date being viewed.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-fg-muted hover:bg-surface-2 hover:text-fg focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {branches.some((b) => b.branch === "CO01B") ? (
          <p className="border-b border-border-subtle bg-surface-2/40 px-5 py-2 text-[11px] text-fg-faint">
            CO01B&apos;s slab % is graded on CO01B + CO01E combined (their targets were set as one); every other row is CO01B alone.
          </p>
        ) : null}
        <div className="overflow-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="sticky left-0 top-0 z-10 bg-surface px-5 py-2.5 text-left text-[11px] font-medium text-fg-faint" />
                {branches.map((b) => (
                  <th key={b.branch} className="sticky top-0 bg-surface px-4 py-2.5 text-right">
                    <div className="text-sm font-semibold text-fg">{b.branch}</div>
                    <div className="text-[10px] font-normal text-fg-faint">
                      {b.region ?? "—"}
                      {b.bodyPaintOnly ? " · Body & Paint" : ""}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SECTIONS.map((section) => (
                <SectionRows key={section.title} section={section} branches={branches} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SectionRows({ section, branches }: { section: Section; branches: CompareBranchData[] }) {
  return (
    <>
      <tr className="bg-surface-2/60">
        <td colSpan={branches.length + 1} className="px-5 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-fg-faint">
          {section.title}
        </td>
      </tr>
      {section.rows.map((row) => {
        const values = branches.map((b) => row.get(b));
        const pens = row.pen ? branches.map((b) => row.pen!(b)) : null;
        return (
          <tr key={row.label} className="border-t border-border-subtle">
            <td className="sticky left-0 bg-surface px-5 py-2.5 text-[13px] text-fg-muted">{row.label}</td>
            {values.map((v, i) => {
              const pen = pens ? pens[i] : null;
              const extra = row.extra ? row.extra(branches[i]) : null;
              return (
                <td
                  key={branches[i].branch}
                  className={`px-4 py-2.5 text-right text-sm font-semibold tabular-nums ${pens ? "text-fg" : cellTone(v, values)}`}
                >
                  {pens ? (
                    pen === null ? (
                      <span className="font-normal text-fg-faint">—</span>
                    ) : (
                      <>
                        <span>{format(v, row.kind)}</span>
                        <span className={`mt-0.5 block text-[11px] font-medium ${cellTone(pen, pens)}`}>{formatPercent(pen)} of PM</span>
                        {extra ? <span className="block text-[10.5px] font-normal text-fg-faint">{extra}</span> : null}
                      </>
                    )
                  ) : (
                    format(v, row.kind)
                  )}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}
