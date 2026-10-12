"use client";

import { useState, useMemo } from "react";
import { control, eyebrow } from "@/lib/ui";
import type { BpReferral } from "./page";

function fmt(ts: Date | string | null): string {
  if (!ts) return "—";
  const d = new Date(ts as string);
  if (isNaN(d.getTime())) return String(ts).slice(0, 16);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Vehicle photo" className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain shadow-xl" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close photo"
          className="absolute -right-3 -top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white text-gray-800 shadow-md hover:bg-gray-100"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function BpReferralsClient({
  referrals,
  branches,
}: {
  referrals: BpReferral[];
  branches: string[];
}) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return referrals.filter((r) => {
      if (branchFilter && r.referring_employee_branch !== branchFilter) return false;
      if (fromDate && r.submitted_at) {
        const submittedDay = (r.submitted_at instanceof Date ? r.submitted_at.toISOString() : String(r.submitted_at)).slice(0, 10);
        if (submittedDay < fromDate) return false;
      }
      if (toDate && r.submitted_at) {
        const submittedDay = (r.submitted_at instanceof Date ? r.submitted_at.toISOString() : String(r.submitted_at)).slice(0, 10);
        if (submittedDay > toDate) return false;
      }
      return true;
    });
  }, [referrals, fromDate, toDate, branchFilter]);

  const hasFilters = fromDate || toDate || branchFilter;

  return (
    <>
      {lightboxUrl ? <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} /> : null}

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className={eyebrow}>From</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className={`${control} px-2`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className={eyebrow}>To</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className={`${control} px-2`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className={eyebrow}>Branch</span>
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className={`${control} px-2`}
          >
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
        {hasFilters ? (
          <button
            type="button"
            onClick={() => { setFromDate(""); setToDate(""); setBranchFilter(""); }}
            className="h-8 rounded-md px-3 text-sm text-fg-muted hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Clear
          </button>
        ) : null}
        <span className="ml-auto text-sm text-fg-muted">
          {filtered.length} {filtered.length === 1 ? "referral" : "referrals"}
          {hasFilters ? " (filtered)" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">#</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Submitted</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Employee</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Branch</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Phone</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Reg No</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Location</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Description</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Photo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-sm text-fg-muted">
                  {hasFilters ? "No referrals match the current filters." : "No referrals yet."}
                </td>
              </tr>
            ) : (
              filtered.map((r, i) => (
                <tr key={r.id} className="hover:bg-surface-2/50">
                  <td className="px-3 py-2.5 tabular-nums text-fg-faint">{i + 1}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-fg-muted">{fmt(r.submitted_at)}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-fg">{r.referring_employee_name ?? "—"}</div>
                    {r.referring_employee_id ? (
                      <div className="text-xs text-fg-faint">ID: {r.referring_employee_id}</div>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-fg-muted">{r.referring_employee_branch || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-fg-muted">{r.customer_phone ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-fg">{r.vehicle_reg_no ?? "—"}</td>
                  <td className="px-3 py-2.5 text-fg-muted">
                    <span title={r.location ?? undefined} className="line-clamp-2 max-w-[140px]">
                      {r.location || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-fg-muted">
                    <span title={r.description ?? undefined} className="line-clamp-2 max-w-[200px]">
                      {r.description || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {r.vehicle_image_url ? (
                      <button
                        type="button"
                        onClick={() => setLightboxUrl(r.vehicle_image_url!)}
                        className="group relative h-12 w-16 overflow-hidden rounded border border-border hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        aria-label="View vehicle photo"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={r.vehicle_image_url}
                          alt="Vehicle"
                          className="h-full w-full object-cover transition-opacity group-hover:opacity-80"
                        />
                      </button>
                    ) : (
                      <span className="flex h-12 w-16 items-center justify-center rounded border border-border bg-surface-2 text-[10px] text-fg-faint">
                        No photo
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
