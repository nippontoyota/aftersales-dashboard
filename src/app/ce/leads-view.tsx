import Link from "next/link";
import { CE_FOLLOW_UP_FILTERS, CE_STATUSES, formatCeDate, formatCeDateTime, type CeCategory, type CeFollowUpFilter, type CeStatus } from "@/lib/ce/rules";
import { loadCeLeadPage } from "@/lib/ce/store";
import { FilterBar, MonthFilter, MultiSelectFilter, YearFilter } from "./filter-bar";
import { RecordCallSheet } from "./record-call-sheet";
import { ContactLink } from "./contact-link";

type Params = { q?: string | string[]; category?: string | string[]; status?: string | string[]; dealer?: string | string[]; followUp?: string | string[]; month?: string | string[]; year?: string | string[]; page?: string | string[] };
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const many = (value: string | string[] | undefined) => (Array.isArray(value) ? value : value ? [value] : []).slice(0, 100);
const number = (value: number) => value.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const categoryTone = { hot: "bg-bad-soft text-bad", warm: "bg-warn-soft text-warn", cold: "bg-info-soft text-info" } as const;

function href(base: string, params: Record<string, string | string[] | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((item) => search.append(key, item));
    else if (value) search.set(key, value);
  }
  return `${base}${search.size ? `?${search}` : ""}`;
}

const toggle = <T extends string>(values: T[], value: T) => values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

export async function LeadsView({ active, editable, today, searchParams }: { active: boolean; editable: boolean; today: string; searchParams: Promise<Params> }) {
  const raw = await searchParams;
  const query = one(raw.q)?.trim().slice(0, 100) || undefined;
  const categories = many(raw.category).filter((item): item is CeCategory => item === "hot" || item === "warm" || item === "cold");
  const statuses = many(raw.status).filter((item): item is CeStatus => CE_STATUSES.includes(item as CeStatus));
  const dealers = many(raw.dealer);
  const followUps = active ? many(raw.followUp).filter((item): item is CeFollowUpFilter => CE_FOLLOW_UP_FILTERS.includes(item as CeFollowUpFilter)) : [];
  const monthValue = Number.parseInt(one(raw.month) ?? "", 10);
  const month = monthValue >= 1 && monthValue <= 12 ? monthValue : undefined;
  const yearValue = Number.parseInt(one(raw.year) ?? "", 10);
  const year = yearValue >= 1900 && yearValue <= 2100 ? yearValue : undefined;
  const page = Math.max(1, Number.parseInt(one(raw.page) ?? "1", 10) || 1);
  const data = await loadCeLeadPage({ today, active, query, categories, statuses, dealers, followUps, month, year, page });
  const base = active ? "/ce" : "/ce/archive";
  const shared = { q: query, category: categories, status: statuses, dealer: dealers, followUp: followUps, month: month ? String(month) : undefined, year: year ? String(year) : undefined };
  const hasFilters = Boolean(query || categories.length || statuses.length || dealers.length || followUps.length || month || year);

  return (
    <main className="mx-auto w-full max-w-[1500px] p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">{active ? "Leads overview" : "Archived CE Leads"}</h1>
          <p className="mt-1 text-sm text-fg-subtle">
            {active ? "Company-wide lead follow-up workspace." : "Leads omitted from the current workbook. Archived records are read-only."}
          </p>
          {active && data.latestImport ? (
            <p className="mt-2 text-xs text-fg-faint">
              {data.latestImport.rowCount.toLocaleString("en-IN")} imported rows · {data.latestImport.sourceFileName} · uploaded {formatCeDateTime(data.latestImport.uploadedAt)} · latest report {formatCeDate(data.latestImport.maxReportDate)}
            </p>
          ) : null}
        </div>
        <Link href={active ? "/ce/archive" : "/ce"} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-fg-muted hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          {active ? "View archive" : "Back to active leads"}
        </Link>
      </div>

      {active ? (
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {([
            ["hot", "Hot", "0–364 days", data.counts.hot, "border-t-bad-solid"],
            ["warm", "Warm", "365–730 days", data.counts.warm, "border-t-warn-solid"],
            ["cold", "Cold", "731+ days", data.counts.cold, "border-t-info-solid"],
          ] as const).map(([key, label, range, count, border]) => (
            <Link key={key} href={href(base, { ...shared, category: toggle(categories, key), page: undefined })} scroll={false} aria-current={categories.includes(key) ? "true" : undefined} className={`rounded-lg border border-border border-t-2 ${border} bg-surface p-4 shadow-card transition hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${categories.includes(key) ? "ring-1 ring-border-strong" : ""}`}>
              <div className="flex items-start justify-between">
                <div><div className="text-sm font-semibold text-fg">{label}</div><div className="mt-0.5 text-xs text-fg-faint">{range}</div></div>
                <div className="text-2xl font-semibold tabular-nums text-fg">{count.toLocaleString("en-IN")}</div>
              </div>
            </Link>
          ))}
        </div>
      ) : null}

      <FilterBar clearHref={base} active={hasFilters}>
        <label className="min-w-[220px] flex-1 self-start">
          <span className="sr-only">Search customer name or VIN</span>
          <input name="q" defaultValue={query} placeholder="Search name, VIN, contact, or model" className="h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" />
        </label>
        <MonthFilter value={month} />
        <YearFilter value={year} years={data.years} />
        <MultiSelectFilter label="Age category" allLabel="All age categories" name="category" selected={categories} options={[{ value: "hot", label: "Hot · 0–364 days" }, { value: "warm", label: "Warm · 365–730 days" }, { value: "cold", label: "Cold · 731+ days" }]} />
        <MultiSelectFilter label="Allocated dealer" allLabel="All dealers" name="dealer" selected={dealers} options={data.dealers.map((dealer) => ({ value: dealer, label: dealer }))} />
        <MultiSelectFilter label="Workflow" allLabel="All workflows" name="status" selected={statuses} options={CE_STATUSES.map((item) => ({ value: item, label: item }))} />
        {active ? <MultiSelectFilter label="Follow-up" allLabel="All follow-ups" name="followUp" selected={followUps} options={[{ value: "due", label: "Due or overdue" }, { value: "upcoming", label: "Upcoming" }, { value: "none", label: "No follow-up date" }]} /> : null}
      </FilterBar>

      <div className="mt-3 text-xs text-fg-faint">{data.total.toLocaleString("en-IN")} lead{data.total === 1 ? "" : "s"}</div>
      {data.rows.length === 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-border-strong bg-surface p-8 text-center text-sm text-fg-subtle">No leads match these filters.</div>
      ) : (
        <>
          <div className="mt-3 hidden overflow-x-auto rounded-lg border border-border bg-surface shadow-card md:block">
            <table className="w-full min-w-[1280px] text-left text-xs">
              <thead className="bg-surface-2 text-[10px] uppercase tracking-wide text-fg-faint"><tr>
                {['Customer', 'Contact', 'VIN', 'Model', 'Allocated dealer', 'Latest service', 'Mileage', 'Age', 'Category', 'Workflow', 'Follow-up', 'Action'].map((label) => <th key={label} className="px-3 py-2.5 font-semibold">{label}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-border-subtle">
                {data.rows.map((lead) => <tr key={lead.vin} className="hover:bg-surface-2/60">
                  <td className="px-3 py-3 font-medium"><Link href={`/ce/leads/${encodeURIComponent(lead.vin)}`} className="text-accent-text underline decoration-transparent underline-offset-2 hover:decoration-current focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{lead.customerName}</Link></td>
                  <td className="px-3 py-3 text-fg-muted"><ContactLink value={lead.contactNumber} /></td>
                  <td className="px-3 py-3 font-mono text-[11px]"><Link href={`/ce/leads/${encodeURIComponent(lead.vin)}`} className="text-fg-muted hover:text-accent-text focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{lead.vin}</Link></td>
                  <td className="px-3 py-3 text-fg-muted">{lead.vehicleModel || "—"}</td>
                  <td className="px-3 py-3 text-fg-muted">{lead.allocatedDealer || "—"}</td>
                  <td className="px-3 py-3 whitespace-nowrap text-fg-muted">{formatCeDate(lead.nReportDate)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-fg-muted">{number(lead.nMileage)}</td>
                  <td className="px-3 py-3 whitespace-nowrap tabular-nums text-fg-muted">{number(lead.ageDays)} days</td>
                  <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold capitalize ${categoryTone[lead.category]}`}>{lead.category}</span></td>
                  <td className="px-3 py-3 whitespace-nowrap text-fg-muted">{lead.status}</td>
                  <td className="px-3 py-3 whitespace-nowrap text-fg-muted">{lead.nextFollowUpDate ? formatCeDate(lead.nextFollowUpDate) : "—"}</td>
                  <td className="px-3 py-3">{active && editable ? <RecordCallSheet vin={lead.vin} customerName={lead.customerName} contactNumber={lead.contactNumber} attemptCount={lead.attemptCount} className="inline-flex h-8 items-center whitespace-nowrap rounded-md bg-accent px-3 text-xs font-medium text-on-accent hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" /> : <Link href={`/ce/leads/${encodeURIComponent(lead.vin)}`} className="inline-flex h-8 items-center whitespace-nowrap rounded-md border border-border-strong px-3 text-xs font-medium text-fg-muted hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">View lead</Link>}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <div className="mt-3 space-y-2 md:hidden">
            {data.rows.map((lead) => <article key={lead.vin} className="rounded-lg border border-border bg-surface p-4 shadow-card">
              <div className="flex items-start justify-between gap-3"><div><Link href={`/ce/leads/${encodeURIComponent(lead.vin)}`} className="font-medium text-fg hover:text-accent-text focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{lead.customerName}</Link><div className="mt-0.5 break-all font-mono text-[11px] text-fg-faint">{lead.vin}</div></div><span className={`rounded-full px-2 py-1 text-[10px] font-semibold capitalize ${categoryTone[lead.category]}`}>{lead.category}</span></div>
              <div className="mt-2 text-xs text-fg-muted"><ContactLink value={lead.contactNumber} />{lead.vehicleModel ? <span> · {lead.vehicleModel}</span> : null}</div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-fg-muted"><span>{lead.allocatedDealer || "No dealer"}</span><span className="text-right">{number(lead.ageDays)} days</span><span>{lead.status}</span><span className="text-right">{lead.nextFollowUpDate ? `Due ${formatCeDate(lead.nextFollowUpDate)}` : "No follow-up"}</span></div>
              <div className="mt-3 border-t border-border-subtle pt-3">{active && editable ? <RecordCallSheet vin={lead.vin} customerName={lead.customerName} contactNumber={lead.contactNumber} attemptCount={lead.attemptCount} className="h-9 w-full rounded-md bg-accent px-3 text-sm font-medium text-on-accent hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" /> : <Link href={`/ce/leads/${encodeURIComponent(lead.vin)}`} className="flex h-9 w-full items-center justify-center rounded-md border border-border-strong px-3 text-sm font-medium text-fg-muted hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">View lead</Link>}</div>
            </article>)}
          </div>
        </>
      )}

      {data.pageCount > 1 ? (
        <nav className="mt-5 flex items-center justify-between" aria-label="Lead pages">
          {data.page > 1 ? <Link href={href(base, { ...shared, page: String(data.page - 1) })} className="rounded-md border border-border px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-2">Previous</Link> : <span />}
          <span className="text-xs text-fg-faint">Page {data.page} of {data.pageCount}</span>
          {data.page < data.pageCount ? <Link href={href(base, { ...shared, page: String(data.page + 1) })} className="rounded-md border border-border px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-2">Next</Link> : <span />}
        </nav>
      ) : null}
    </main>
  );
}
