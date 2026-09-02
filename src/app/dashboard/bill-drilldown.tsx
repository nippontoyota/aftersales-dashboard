"use client";

import { useState } from "react";

type BillCategory = "scrap" | "used_oil";

type BillItem = {
  id: number;
  invoiceNumber: string;
  taxableValue: number;
  category: BillCategory | null;
  sourceFileName: string;
  uploadedAt: string;
};

const CATEGORY_LABEL: Record<BillCategory, string> = { scrap: "Scrap", used_oil: "Used Oil" };

function rs(n: number): string {
  return `Rs ${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export function BillDrilldown({
  month,
  total,
  count,
  scrapTotal,
  usedOilTotal,
  untaggedTotal,
}: {
  month: string;
  total: number;
  count: number;
  scrapTotal: number;
  usedOilTotal: number;
  untaggedTotal: number;
}) {
  const [open, setOpen] = useState(false);
  const [bills, setBills] = useState<BillItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (bills.length > 0) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/bills?month=${month}`);
      const data = await res.json();
      setBills(data.bills ?? []);
    } catch {
      // silently fail — user sees empty list
    } finally {
      setLoading(false);
    }
  }

  const monthLabel = formatMonth(month);

  return (
    <div className="rounded border border-slate-200 bg-white">
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="min-w-0">
          <span className="text-sm font-medium text-slate-900">{monthLabel}</span>
          <span className="ml-2 text-xs text-slate-500">{count} {count === 1 ? "bill" : "bills"}</span>
          <div className="mt-0.5 text-[11px] text-slate-500">
            Scrap {rs(scrapTotal)} · Used Oil {rs(usedOilTotal)}
            {untaggedTotal > 0 ? <span className="text-amber-600"> · Untagged {rs(untaggedTotal)}</span> : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">{rs(total)}</span>
          <svg
            className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-4 py-3">
          {loading ? (
            <p className="text-xs text-slate-500">Loading bills…</p>
          ) : bills.length === 0 ? (
            <p className="text-xs text-slate-500">No bills found.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="pb-2 font-medium">Invoice No</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium text-right">Taxable Value</th>
                  <th className="pb-2 font-medium">File</th>
                  <th className="pb-2 font-medium">Uploaded</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={b.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-1.5 font-medium text-slate-900">{b.invoiceNumber}</td>
                    <td className={`py-1.5 ${b.category ? "text-slate-600" : "text-amber-600"}`}>
                      {b.category ? CATEGORY_LABEL[b.category] : "Untagged"}
                    </td>
                    <td className="py-1.5 text-right text-slate-700">
                      Rs {b.taxableValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-1.5 text-slate-500 max-w-[120px] truncate">{b.sourceFileName}</td>
                    <td className="py-1.5 text-slate-500">
                      {new Date(b.uploadedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </td>
                    <td className="py-1.5">
                      <a
                        href={`/api/bills/${b.id}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-red-600 hover:text-red-800 hover:underline"
                      >
                        View PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function formatMonth(ym: string): string {
  const [year, month] = ym.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}
