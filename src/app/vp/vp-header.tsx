import { DateSelect } from "../dashboard/date-select";
import { PrintButton } from "./print-button";
import { RaiseQueryButton } from "./flag-composer";

/**
 * The executive header every /vp page shares — a title block over a thin
 * accent rule, with the date control and the always-present "Raise a query"
 * / "Export to PDF" actions on the right. Distinct from the rest of the
 * dashboard's page headers on purpose (this is the VP's own view).
 */
export function VpHeader({
  title,
  eyebrow,
  subtitle,
  dates,
  date,
  basePath,
  dateExtraParams,
  flagHref,
  showPrint = false,
  asOfLabel,
  children,
}: {
  title: string;
  eyebrow: string;
  subtitle?: string;
  dates?: string[];
  date?: string;
  basePath?: string;
  dateExtraParams?: Record<string, string>;
  flagHref: string;
  showPrint?: boolean;
  asOfLabel?: string;
  /** Extra controls (a branch picker, a metric select) placed before the actions. */
  children?: React.ReactNode;
}) {
  return (
    <header className="border-b border-border pb-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-text">{eyebrow}</div>
          <h1 className="mt-1.5 text-[26px] font-semibold leading-tight tracking-tight text-fg">{title}</h1>
          {subtitle ? <p className="mt-1.5 max-w-xl text-[13px] text-fg-subtle">{subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {children}
          {dates && date && basePath ? (
            <DateSelect dates={dates} selected={date} region="All" basePath={basePath} extraParams={dateExtraParams} />
          ) : null}
          <RaiseQueryButton flagHref={flagHref} />
          {showPrint ? <PrintButton /> : null}
        </div>
      </div>
      {asOfLabel ? (
        <p className="mt-3 text-[11px] uppercase tracking-[0.08em] text-fg-faint">Data as of {asOfLabel} IST</p>
      ) : null}
    </header>
  );
}
