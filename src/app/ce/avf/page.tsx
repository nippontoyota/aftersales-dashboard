import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";
import { CE_AVF_CATEGORIES, CE_FOLLOW_UP_FILTERS, CE_STATUSES, formatCeDate, indiaDate, type CeAvfCategory, type CeFollowUpFilter, type CeStatus } from "@/lib/ce/rules";
import { loadCeAvfPage } from "@/lib/ce/store";
import { CeShell } from "../ce-shell";
import { FilterBar, MonthFilter, MultiSelectFilter, YearFilter } from "../filter-bar";
import { ContactLink } from "../contact-link";

type Params = { q?: string | string[]; category?: string | string[]; status?: string | string[]; dealer?: string | string[]; followUp?: string | string[]; month?: string | string[]; year?: string | string[]; page?: string | string[] };
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const many = (value: string | string[] | undefined) => (Array.isArray(value) ? value : value ? [value] : []).slice(0, 100);
const mileage = (value: number | null) => value === null ? "—" : value.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const avf = (value: number | null) => value === null ? "—" : value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const bands = {
  red: { label: "Red", range: "Below 1.0", help: "Under 10,000 km", border: "border-t-bad-solid", tone: "bg-bad-soft text-bad" },
  yellow: { label: "Yellow", range: "1.0–1.7", help: "10,000–17,000 km", border: "border-t-warn-solid", tone: "bg-warn-soft text-warn" },
  green: { label: "Green", range: "Above 1.7", help: "Over 17,000 km", border: "border-t-good-solid", tone: "bg-good-soft text-good" },
  unavailable: { label: "Unavailable", range: "No N−1 mileage", help: "Awaiting another service record", border: "border-t-border-strong", tone: "bg-surface-3 text-fg-muted" },
} as const;

function href(params: Record<string, string | string[] | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((item) => search.append(key, item));
    else if (value) search.set(key, value);
  }
  return `/ce/avf${search.size ? `?${search}` : ""}`;
}

const toggle = <T extends string>(values: T[], value: T) => values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

export default async function CeAvfPage({ searchParams }: { searchParams: Promise<Params> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  if (admin.role !== "ce" && admin.role !== "hq") redirect("/");

  const raw = await searchParams;
  const query = one(raw.q)?.trim().slice(0, 100) || undefined;
  const categories = many(raw.category).filter((item): item is CeAvfCategory => CE_AVF_CATEGORIES.includes(item as CeAvfCategory));
  const statuses = many(raw.status).filter((item): item is CeStatus => CE_STATUSES.includes(item as CeStatus));
  const dealers = many(raw.dealer);
  const followUps = many(raw.followUp).filter((item): item is CeFollowUpFilter => CE_FOLLOW_UP_FILTERS.includes(item as CeFollowUpFilter));
  const monthValue = Number.parseInt(one(raw.month) ?? "", 10);
  const month = monthValue >= 1 && monthValue <= 12 ? monthValue : undefined;
  const yearValue = Number.parseInt(one(raw.year) ?? "", 10);
  const year = yearValue >= 1900 && yearValue <= 2100 ? yearValue : undefined;
  const page = Math.max(1, Number.parseInt(one(raw.page) ?? "1", 10) || 1);
  const data = await loadCeAvfPage({ today: indiaDate(), query, categories, statuses, dealers, followUps, month, year, page });
  const shared = { q: query, category: categories, status: statuses, dealer: dealers, followUp: followUps, month: month ? String(month) : undefined, year: year ? String(year) : undefined };
  const hasFilters = Boolean(query || categories.length || statuses.length || dealers.length || followUps.length || month || year);

  return (
    <CeShell admin={admin} current="avf">
      <main className="mx-auto w-full max-w-[1500px] p-4 sm:p-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-faint">Mileage analysis</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-fg">AVF analytics</h1>
          <p className="mt-1 text-sm text-fg-subtle">AVF = (N mileage − N−1 mileage) ÷ 10,000. Combine categories, dealers, workflow, and follow-up filters.</p>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {CE_AVF_CATEGORIES.map((key) => {
            const band = bands[key];
            const selected = categories.includes(key);
            return (
              <Link
                key={key}
                href={href({ ...shared, category: toggle(categories, key) })}
                scroll={false}
                aria-current={selected ? "true" : undefined}
                className={`rounded-lg border border-border border-t-2 ${band.border} bg-surface p-4 shadow-card transition hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${selected ? "ring-1 ring-border-strong" : ""}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div><div className="text-sm font-semibold text-fg">{band.label}</div><div className="mt-0.5 text-xs font-medium text-fg-muted">AVF {band.range.toLowerCase()}</div><div className="mt-1 text-[11px] text-fg-faint">{band.help}</div></div>
                  <div className="text-2xl font-semibold tabular-nums text-fg">{data.counts[key].toLocaleString("en-IN")}</div>
                </div>
              </Link>
            );
          })}
        </div>

        <FilterBar clearHref="/ce/avf" active={hasFilters}>
          <label className="min-w-[220px] flex-1 self-start">
            <span className="sr-only">Search customer name or VIN</span>
            <input name="q" defaultValue={query} placeholder="Search name, VIN, contact, or model" className="h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" />
          </label>
          <MonthFilter value={month} />
          <YearFilter value={year} years={data.years} />
          <MultiSelectFilter label="AVF category" allLabel="All AVF categories" name="category" selected={categories} options={CE_AVF_CATEGORIES.map((key) => ({ value: key, label: `${bands[key].label} · ${bands[key].range}` }))} />
          <MultiSelectFilter label="Allocated dealer" allLabel="All dealers" name="dealer" selected={dealers} options={data.dealers.map((dealer) => ({ value: dealer, label: dealer }))} />
          <MultiSelectFilter label="Workflow" allLabel="All workflows" name="status" selected={statuses} options={CE_STATUSES.map((item) => ({ value: item, label: item }))} />
          <MultiSelectFilter label="Follow-up" allLabel="All follow-ups" name="followUp" selected={followUps} options={[{ value: "due", label: "Due or overdue" }, { value: "upcoming", label: "Upcoming" }, { value: "none", label: "No follow-up date" }]} />
        </FilterBar>

        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-fg-faint">
          <span>{data.total.toLocaleString("en-IN")} lead{data.total === 1 ? "" : "s"}</span>
          {categories.length ? <span className="rounded-full bg-surface-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-fg-muted">{categories.map((item) => bands[item].label).join(" + ")}</span> : null}
        </div>

        {data.rows.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-border-strong bg-surface p-8 text-center text-sm text-fg-subtle">No leads match these filters.</div>
        ) : (
          <>
            <div className="mt-3 hidden overflow-x-auto rounded-lg border border-border bg-surface shadow-card md:block">
              <table className="w-full min-w-[1300px] text-left text-xs">
                <thead className="bg-surface-2 text-[10px] uppercase tracking-wide text-fg-faint"><tr>
                  {[
                    "Customer", "Contact", "VIN", "Model", "Allocated dealer", "Latest service", "N−1 mileage", "N mileage", "Difference", "AVF", "Category", "Workflow", "Follow-up", "Action",
                  ].map((label) => <th key={label} className="px-3 py-2.5 font-semibold">{label}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-border-subtle">
                  {data.rows.map((lead) => {
                    const band = bands[lead.category];
                    return <tr key={lead.vin} className="hover:bg-surface-2/60">
                      <td className="px-3 py-3 font-medium"><Link href={`/ce/leads/${encodeURIComponent(lead.vin)}`} className="text-accent-text underline decoration-transparent underline-offset-2 hover:decoration-current focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{lead.customerName}</Link></td>
                      <td className="px-3 py-3 text-fg-muted"><ContactLink value={lead.contactNumber} /></td>
                      <td className="px-3 py-3 font-mono text-[11px] text-fg-muted">{lead.vin}</td>
                      <td className="px-3 py-3 text-fg-muted">{lead.vehicleModel || "—"}</td>
                      <td className="px-3 py-3 text-fg-muted">{lead.allocatedDealer || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-fg-muted">{formatCeDate(lead.nReportDate)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-fg-muted">{mileage(lead.n1Mileage)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-fg-muted">{mileage(lead.nMileage)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-fg-muted">{lead.n1Mileage === null ? "—" : mileage(lead.nMileage - lead.n1Mileage)}</td>
                      <td className="px-3 py-3 text-right text-sm font-semibold tabular-nums text-fg">{avf(lead.avf)}</td>
                      <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${band.tone}`}>{band.label}</span></td>
                      <td className="whitespace-nowrap px-3 py-3 text-fg-muted">{lead.status}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-fg-muted">{lead.nextFollowUpDate ? formatCeDate(lead.nextFollowUpDate) : "—"}</td>
                      <td className="px-3 py-3"><Link href={`/ce/leads/${encodeURIComponent(lead.vin)}`} className="inline-flex h-8 items-center whitespace-nowrap rounded-md border border-border-strong px-3 text-xs font-medium text-fg-muted hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Open lead</Link></td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3 space-y-2 md:hidden">
              {data.rows.map((lead) => {
                const band = bands[lead.category];
                return <article key={lead.vin} className="rounded-lg border border-border bg-surface p-4 shadow-card">
                  <div className="flex items-start justify-between gap-3"><div><Link href={`/ce/leads/${encodeURIComponent(lead.vin)}`} className="font-medium text-fg hover:text-accent-text focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{lead.customerName}</Link><div className="mt-0.5 break-all font-mono text-[11px] text-fg-faint">{lead.vin}</div></div><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${band.tone}`}>{band.label}</span></div>
                  <div className="mt-2 text-xs text-fg-muted"><ContactLink value={lead.contactNumber} />{lead.vehicleModel ? <span> · {lead.vehicleModel}</span> : null}</div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-xs"><div><div className="text-[10px] uppercase tracking-wide text-fg-faint">N−1 mileage</div><div className="mt-1 tabular-nums text-fg-muted">{mileage(lead.n1Mileage)}</div></div><div><div className="text-[10px] uppercase tracking-wide text-fg-faint">N mileage</div><div className="mt-1 tabular-nums text-fg-muted">{mileage(lead.nMileage)}</div></div><div className="text-right"><div className="text-[10px] uppercase tracking-wide text-fg-faint">AVF</div><div className="mt-1 text-base font-semibold tabular-nums text-fg">{avf(lead.avf)}</div></div></div>
                  <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3 text-xs text-fg-muted"><span>{lead.allocatedDealer || "No dealer"} · {lead.status}{lead.nextFollowUpDate ? ` · ${formatCeDate(lead.nextFollowUpDate)}` : ""}</span><Link href={`/ce/leads/${encodeURIComponent(lead.vin)}`} className="font-medium text-accent-text">Open lead →</Link></div>
                </article>;
              })}
            </div>
          </>
        )}

        {data.pageCount > 1 ? (
          <nav className="mt-5 flex items-center justify-between" aria-label="AVF lead pages">
            {data.page > 1 ? <Link href={href({ ...shared, page: String(data.page - 1) })} className="rounded-md border border-border px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-2">Previous</Link> : <span />}
            <span className="text-xs text-fg-faint">Page {data.page} of {data.pageCount}</span>
            {data.page < data.pageCount ? <Link href={href({ ...shared, page: String(data.page + 1) })} className="rounded-md border border-border px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-2">Next</Link> : <span />}
          </nav>
        ) : null}
      </main>
    </CeShell>
  );
}
