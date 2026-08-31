export function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3.5 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div> : null}
    </div>
  );
}
