"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { control } from "@/lib/ui";

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** All date math here is UTC, matching reporting-date.ts's convention — the
 * app has always treated the report date as a plain `toISOString()` slice,
 * not IST-corrected, so the calendar grid must agree with that or a date
 * could shift by a day depending on the viewer's local timezone. */
function parseIsoUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function isoOfUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDisplay(iso: string): string {
  return parseIsoUtc(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * A custom calendar popover — replaces the old `<select>` dropdown that only
 * ever listed dates with a BA Tool upload already on file. Any date is
 * pickable now (branches are backfilling data from January onward, so a date
 * without an upload yet is a normal, temporary state, not an error); `dates`
 * still drives a small dot marker so it's obvious at a glance which days
 * already have data. Dates after today are disabled — a report for a future
 * date can never exist.
 */
export function DateSelect({
  dates,
  selected,
  region,
  basePath = "/dashboard",
  extraParams,
}: {
  dates: string[];
  selected: string;
  region: string;
  basePath?: string;
  /** Extra query params to carry along on
   * every navigation — otherwise switching dates silently drops them. */
  extraParams?: Record<string, string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedDate = useMemo(() => parseIsoUtc(selected), [selected]);
  const [viewYear, setViewYear] = useState(selectedDate.getUTCFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getUTCMonth());

  const datesWithData = useMemo(() => new Set(dates), [dates]);
  const todayIso = useMemo(() => isoOfUtc(new Date()), []);

  useEffect(() => {
    if (!open) return;
    // Jump the visible month back to the selected date each time the popover opens.
    setViewYear(selectedDate.getUTCFullYear());
    setViewMonth(selectedDate.getUTCMonth());

    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, selectedDate]);

  function navigate(iso: string) {
    const params = new URLSearchParams({ date: iso, ...extraParams });
    if (region !== "All") params.set("region", region);
    router.push(`${basePath}?${params.toString()}`);
    setOpen(false);
  }

  function goPrevMonth() {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  }
  function goNextMonth() {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
  const leadingBlanks = new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay();
  const cells: (number | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const monthLabel = new Date(Date.UTC(viewYear, viewMonth, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${control} flex items-center gap-1.5 px-2.5`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5 text-fg-subtle" aria-hidden="true">
          <rect x="2" y="3" width="12" height="11" rx="1.5" />
          <path d="M2 6.5h12M5 1.5v3M11 1.5v3" strokeLinecap="round" />
        </svg>
        {formatDisplay(selected)}
      </button>

      {open ? (
        <div role="dialog" aria-label="Choose a date" className="absolute right-0 z-30 mt-1.5 w-64 rounded-lg border border-border-strong bg-surface p-3 shadow-lg">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={goPrevMonth}
              aria-label="Previous month"
              className="flex h-6 w-6 items-center justify-center rounded text-fg-subtle hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                <path d="M10 3 5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span className="text-[13px] font-medium text-fg">{monthLabel}</span>
            <button
              type="button"
              onClick={goNextMonth}
              aria-label="Next month"
              className="flex h-6 w-6 items-center justify-center rounded text-fg-subtle hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                <path d="M6 3 11 8l-5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-y-1 text-center">
            {WEEKDAY_LABELS.map((w) => (
              <span key={w} className="text-[10px] font-medium text-fg-faint">
                {w}
              </span>
            ))}
            {cells.map((day, i) => {
              if (day === null) return <span key={`blank-${i}`} />;
              const iso = isoOfUtc(new Date(Date.UTC(viewYear, viewMonth, day)));
              const isSelected = iso === selected;
              const isToday = iso === todayIso;
              const hasData = datesWithData.has(iso);
              const isFuture = iso > todayIso;
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={isFuture}
                  onClick={() => navigate(iso)}
                  title={hasData ? undefined : "No data uploaded for this date"}
                  className={[
                    "relative mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    isSelected
                      ? "bg-accent font-semibold text-on-accent"
                      : isFuture
                        ? "cursor-not-allowed text-fg-faint/50"
                        : "text-fg hover:bg-surface-2",
                    isToday && !isSelected ? "ring-1 ring-inset ring-accent/50" : "",
                  ].join(" ")}
                >
                  {day}
                  {hasData && !isSelected ? <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-accent" aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
