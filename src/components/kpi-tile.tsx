export function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-border bg-surface px-3.5 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-fg">{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-fg-faint">{sub}</div> : null}
    </div>
  );
}
