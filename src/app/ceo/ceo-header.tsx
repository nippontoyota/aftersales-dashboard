import Link from "next/link";
import { DateSelect } from "../dashboard/date-select";

/**
 * The CEO view's own page header — title block over a thin rule, date
 * control on the right. Deliberately simpler than VpHeader (no query-flag
 * button — the CEO isn't raising queries to HQ, that's the VP's flow).
 */
export function CeoHeader({
  title,
  eyebrow,
  subtitle,
  dates,
  date,
  basePath,
  dateExtraParams,
  asOfLabel,
  backHref,
  backLabel,
  children,
}: {
  title: string;
  eyebrow: string;
  subtitle?: string;
  dates?: string[];
  date?: string;
  basePath?: string;
  dateExtraParams?: Record<string, string>;
  asOfLabel?: string;
  backHref?: string;
  backLabel?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="border-b border-border pb-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {backHref ? (
            <Link
              href={backHref}
              className="mb-2 inline-flex items-center gap-1 text-[12px] font-medium text-fg-subtle hover:text-accent-text print:hidden"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M10 3 5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {backLabel ?? "Back"}
            </Link>
          ) : null}
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-text">{eyebrow}</div>
          <h1 className="mt-1.5 text-[26px] font-semibold leading-tight tracking-tight text-fg">{title}</h1>
          {subtitle ? <p className="mt-1.5 max-w-xl text-[13px] text-fg-subtle">{subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {children}
          {dates && date && basePath ? (
            <DateSelect dates={dates} selected={date} region="All" basePath={basePath} extraParams={dateExtraParams} />
          ) : null}
        </div>
      </div>
      {asOfLabel ? <p className="mt-3 text-[11px] uppercase tracking-[0.08em] text-fg-faint">Data as of {asOfLabel} IST</p> : null}
    </header>
  );
}
