"use client";

import { useEffect, useRef, useState } from "react";
import { formatCeDate } from "@/lib/ce/rules";

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function isoOf(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseIso(iso: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
}

/** Calendar-grid date picker (added 2026-11-03, replacing a free-typed
 * DD/MM/YYYY field) that makes Sundays and HQ-flagged holidays
 * (report_holidays — the workshop's own non-working-day calendar, same
 * table /data edits) actually unselectable rather than merely rejected
 * after the fact, since an appointment or follow-up can't land on a day
 * the branch is closed. */
export function HolidayDatePicker({
  name,
  label,
  valueIso,
  onChangeIso,
  minIso,
  holidays,
}: {
  name: string;
  label: string;
  valueIso: string | null;
  onChangeIso: (iso: string) => void;
  minIso: string;
  holidays: ReadonlySet<string>;
}) {
  const [open, setOpen] = useState(false);
  const anchor = (valueIso && parseIso(valueIso)) || parseIso(minIso)!;
  const [viewYear, setViewYear] = useState(anchor.year);
  const [viewMonth, setViewMonth] = useState(anchor.month);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function disabledReason(iso: string): string | null {
    if (iso < minIso) return "Past";
    if (new Date(`${iso}T00:00:00Z`).getUTCDay() === 0) return "Sunday — closed";
    if (holidays.has(iso)) return "Holiday";
    return null;
  }

  const startWeekday = new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(startWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  function changeMonth(delta: number) {
    const next = new Date(Date.UTC(viewYear, viewMonth + delta, 1));
    setViewYear(next.getUTCFullYear());
    setViewMonth(next.getUTCMonth());
  }

  return (
    <div ref={containerRef} className="relative">
      <span className="block text-xs font-medium text-fg-muted">{label}</span>
      <input type="hidden" name={name} value={valueIso ?? ""} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="mt-1 flex h-9 w-full items-center justify-between rounded-md border border-border-strong bg-surface px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className={valueIso ? "text-fg" : "text-fg-faint"}>{valueIso ? formatCeDate(valueIso) : "Choose a date"}</span>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5 text-fg-faint" aria-hidden="true">
          <rect x="2.5" y="3" width="11" height="10.5" rx="1.5" /><path d="M2.5 6.5h11M5.5 2v2M10.5 2v2" strokeLinecap="round" />
        </svg>
      </button>

      {open ? (
        <div role="dialog" aria-label={label} className="absolute z-50 mt-1 w-72 rounded-md border border-border-strong bg-surface p-3 shadow-pop">
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => changeMonth(-1)} aria-label="Previous month" className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2">‹</button>
            <span className="text-xs font-semibold text-fg">{MONTH_LABELS[viewMonth]} {viewYear}</span>
            <button type="button" onClick={() => changeMonth(1)} aria-label="Next month" className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2">›</button>
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-fg-faint">
            {WEEKDAY_LABELS.map((d, i) => <span key={`${d}-${i}`}>{d}</span>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (day === null) return <span key={`empty-${i}`} />;
              const iso = isoOf(viewYear, viewMonth, day);
              const reason = disabledReason(iso);
              const selected = iso === valueIso;
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={!!reason}
                  title={reason ?? undefined}
                  onClick={() => { onChangeIso(iso); setOpen(false); }}
                  className={`h-7 rounded text-xs tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    selected
                      ? "bg-accent font-semibold text-on-accent"
                      : reason
                        ? "cursor-not-allowed text-fg-faint line-through decoration-fg-faint/60"
                        : "text-fg hover:bg-surface-2"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] text-fg-faint">Sundays and HQ holidays can&apos;t be picked.</p>
        </div>
      ) : null}
    </div>
  );
}
