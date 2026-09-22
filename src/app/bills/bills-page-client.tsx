"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type BillCategory = "scrap" | "used_oil";

type BillMonthTotal = {
  month: string;
  total: number;
  count: number;
  scrapTotal: number;
  usedOilTotal: number;
  untaggedTotal: number;
};

type BillItem = {
  id: number;
  invoiceNumber: string;
  taxableValue: number;
  category: BillCategory | null;
  invoiceDate: string | null;
  sourceFileName: string;
  uploadedAt: string;
};

const CATEGORY_LABEL: Record<BillCategory, string> = { scrap: "Scrap", used_oil: "Used Oil" };

function rs(n: number): string {
  return `Rs ${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

function formatMonth(ym: string): string {
  const [year, month] = ym.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export function BillsPageClient({
  months,
  initialMonth,
}: {
  months: BillMonthTotal[];
  initialMonth: string | undefined;
}) {
  const router = useRouter();
  const [selectedMonth, setSelectedMonth] = useState(initialMonth ?? months[0]?.month ?? "");
  const [bills, setBills] = useState<BillItem[]>([]);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const currentMonthData = months.find((m) => m.month === selectedMonth);

  function handleMonthChange(month: string) {
    setSelectedMonth(month);
    setExpanded(false);
    setBills([]);
    setLoaded(null);
    router.push(`/bills?month=${month}`, { scroll: false });
  }

  async function toggleExpand() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (loaded === selectedMonth) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/bills?month=${selectedMonth}`);
      const data = await res.json();
      setBills(data.bills ?? []);
      setLoaded(selectedMonth);
    } catch {
      // silently fail — shows empty table
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Month selector */}
      <div className="flex items-center gap-3">
        <label htmlFor="bills-month-select" className="text-sm font-medium text-fg-muted">
          Month
        </label>
        <select
          id="bills-month-select"
          value={selectedMonth}
          onChange={(e) => handleMonthChange(e.target.value)}
          className="h-9 rounded-md border border-border-strong bg-surface px-3 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent"
        >
          {months.map((m) => (
            <option key={m.month} value={m.month}>
              {formatMonth(m.month)}
            </option>
          ))}
        </select>
      </div>

      {/* Summary tiles */}
      {currentMonthData ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Invoices" value={String(currentMonthData.count)} />
          <Tile label="Total taxable value" value={rs(currentMonthData.total)} />
          <Tile label="Scrap" value={rs(currentMonthData.scrapTotal)} />
          <Tile label="Used Oil" value={rs(currentMonthData.usedOilTotal)} />
          {currentMonthData.untaggedTotal > 0 && (
            <div className="col-span-2 sm:col-span-4 rounded-lg border border-warn/30 bg-warn-soft p-3 text-sm text-warn">
              <span className="font-medium">Rs {currentMonthData.untaggedTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              {" "}in untagged bills — these won&apos;t count toward any revenue line until they&apos;re categorised.
            </div>
          )}
        </div>
      ) : null}

      {/* Per-invoice drilldown */}
      {currentMonthData && currentMonthData.count > 0 ? (
        <div className="rounded-lg border border-border bg-surface">
          <button
            onClick={toggleExpand}
            className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-surface-2 transition-colors rounded-lg"
          >
            <span className="text-sm font-medium text-fg">
              {expanded ? "Hide" : "Show"} individual invoices
            </span>
            <svg
              className={`h-4 w-4 text-fg-faint transition-transform ${expanded ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expanded && (
            <div className="border-t border-border-subtle px-5 py-4">
              {loading ? (
                <p className="text-xs text-fg-subtle">Loading invoices…</p>
              ) : bills.length === 0 ? (
                <p className="text-xs text-fg-subtle">No invoices found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border-subtle text-left text-fg-subtle">
                        <th className="pb-2 font-medium">Invoice No</th>
                        <th className="pb-2 font-medium">Type</th>
                        <th className="pb-2 font-medium text-right">Taxable Value</th>
                        <th className="pb-2 font-medium">Invoice Date</th>
                        <th className="pb-2 font-medium hidden sm:table-cell">File</th>
                        <th className="pb-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {bills.map((b) => (
                        <tr
                          key={b.id}
                          className="border-b border-border-subtle last:border-0"
                          title={`Uploaded ${new Date(b.uploadedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
                        >
                          <td className="py-2 font-medium text-fg">{b.invoiceNumber}</td>
                          <td className={`py-2 ${b.category ? "text-fg-muted" : "text-warn"}`}>
                            {b.category ? CATEGORY_LABEL[b.category] : "Untagged"}
                          </td>
                          <td className="py-2 text-right text-fg-muted">
                            Rs {b.taxableValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2 text-fg-subtle">
                            {b.invoiceDate
                              ? new Date(`${b.invoiceDate}T00:00:00`).toLocaleDateString("en-IN", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })
                              : "—"}
                          </td>
                          <td className="py-2 text-fg-subtle max-w-[140px] truncate hidden sm:table-cell">
                            {b.sourceFileName}
                          </td>
                          <td className="py-2">
                            <a
                              href={`/api/bills/${b.id}/pdf`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-accent-text hover:text-accent hover:underline"
                            >
                              View PDF
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3 shadow-card">
      <div className="text-[11px] uppercase tracking-wide text-fg-faint">{label}</div>
      <div className="mt-1 text-xl font-semibold text-fg">{value}</div>
    </div>
  );
}
