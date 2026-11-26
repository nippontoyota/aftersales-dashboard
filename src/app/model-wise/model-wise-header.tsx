import { DateSelect } from "../dashboard/date-select";

/** Model-wise's own page header — same shape as accounts-header.tsx (title
 * block over a thin rule, date control + Download Excel on the right). */
export function ModelWiseHeader({
  title,
  subtitle,
  dates,
  date,
  downloadHref,
}: {
  title: string;
  subtitle?: string;
  dates: string[];
  date: string;
  downloadHref: string;
}) {
  return (
    <header className="border-b border-border pb-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-text">Nippon Group</div>
          <h1 className="mt-1.5 text-[26px] font-semibold leading-tight tracking-tight text-fg">{title}</h1>
          {subtitle ? <p className="mt-1.5 max-w-xl text-[13px] text-fg-subtle">{subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <DateSelect dates={dates} selected={date} region="All" basePath="/model-wise" />
          <a
            href={downloadHref}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 py-1.5 text-xs font-medium text-fg-muted hover:bg-surface-2"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M8 2v8m0 0-3-3m3 3 3-3M3 13h10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Download Excel
          </a>
        </div>
      </div>
    </header>
  );
}
