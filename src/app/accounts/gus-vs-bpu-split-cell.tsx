import { formatCompact } from "@/lib/format";

/**
 * One branch's GUS-vs-BPU RO split for the branchwise table — same
 * stacked-bar-in-a-cell shape as ceo/branches/branch-row.tsx's GusSplitCell,
 * specialized to 2 segments. Pure actuals (raw RO counts), no target
 * involved (2026-11-05, accounts branchwise redesign).
 */
export function GusVsBpuSplitCell({ gus, bpu }: { gus: number | null; bpu: number | null }) {
  const total = (gus ?? 0) + (bpu ?? 0);
  if (gus == null && bpu == null) {
    return <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-fg-faint">—</td>;
  }
  return (
    <td className="whitespace-nowrap px-4 py-2 text-right" title={`GUS ${gus ?? 0} · BPU ${bpu ?? 0}`}>
      <div className="ml-auto h-1.5 w-20 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-border-subtle">
        <div className="flex h-full w-full">
          {total > 0 ? (
            <>
              {(gus ?? 0) > 0 ? <div className="bg-accent-solid" style={{ width: `${((gus ?? 0) / total) * 100}%` }} /> : null}
              {(bpu ?? 0) > 0 ? <div className="bg-info-solid" style={{ width: `${((bpu ?? 0) / total) * 100}%` }} /> : null}
            </>
          ) : null}
        </div>
      </div>
      <div className="mt-0.5 text-[10.5px] tabular-nums text-fg-faint">
        {formatCompact(gus)} GUS · {formatCompact(bpu)} BPU
      </div>
    </td>
  );
}
