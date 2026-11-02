import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";
import { CE_STATUSES, dateAgeInDays, formatCeDate, indiaDate, type CeStatus } from "@/lib/ce/rules";
import { loadCeMrsGapList } from "@/lib/ce/store";
import { CeShell } from "../ce-shell";
import { FilterBar, MultiSelectFilter } from "../filter-bar";
import { ContactLink } from "../contact-link";

type Section = "priority" | "overdue";
type Params = { section?: string | string[]; q?: string | string[]; dealer?: string | string[]; status?: string | string[]; page?: string | string[] };
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const many = (value: string | string[] | undefined) => (Array.isArray(value) ? value : value ? [value] : []).slice(0, 100);
const mileage = (value: number) => value.toLocaleString("en-IN", { maximumFractionDigits: 0 });

function href(params: Record<string, string | string[] | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((item) => search.append(key, item));
    else if (value) search.set(key, value);
  }
  return `/ce/mrs${search.size ? `?${search}` : ""}`;
}

function OverdueBadge({ dueDate, today }: { dueDate: string; today: string }) {
  const days = dateAgeInDays(dueDate, today);
  return <span className="rounded-full bg-bad-soft px-2 py-1 text-[10px] font-semibold text-bad">Overdue {days}d</span>;
}

export default async function CeMrsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  if (admin.role !== "ce" && admin.role !== "hq") redirect("/");

  const raw = await searchParams;
  const section: Section = one(raw.section) === "overdue" ? "overdue" : "priority";
  const query = one(raw.q)?.trim().slice(0, 100) || undefined;
  const dealers = many(raw.dealer);
  const statuses = many(raw.status).filter((item): item is CeStatus => CE_STATUSES.includes(item as CeStatus));
  const page = Math.max(1, Number.parseInt(one(raw.page) ?? "1", 10) || 1);
  const today = indiaDate();
  const data = await loadCeMrsGapList({ today, section, query, dealers, statuses, page });
  const shared = { section, q: query, dealer: dealers, status: statuses };
  const hasFilters = Boolean(query || dealers.length || statuses.length);

  const tabs: { key: Section; label: string; count: number }[] = [
    { key: "priority", label: "Priority", count: data.priorityCount },
    { key: "overdue", label: "Overdue", count: data.overdueCount },
  ];

  return (
    <CeShell admin={admin} current="mrs">
      <main className="mx-auto w-full max-w-[1500px] p-4 sm:p-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-faint">Maintenance Reminder System</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-fg">MRS catch list</h1>
          <p className="mt-1 text-sm text-fg-subtle">
            {section === "priority"
              ? `Leads due ${formatCeDate(data.priorityDueDate)} (12 months or 10,000 km since last visit, whichever first) that TKM's own N-9 list never covered — call now, matching TKM's own N-7 call lead time, so the customer still has a week's notice.`
              : `Leads overdue since ${formatCeDate(data.overdueWindowStart)}–yesterday, never covered by TKM's N-9 — work through these if time allows.`}
          </p>
        </div>

        <div className="mt-4 flex gap-2 border-b border-border">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={href({ section: tab.key, q: query, dealer: dealers, status: statuses })}
              aria-current={section === tab.key ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${section === tab.key ? "border-accent text-accent-text" : "border-transparent text-fg-muted hover:text-fg"}`}
            >
              {tab.label} <span className="tabular-nums text-fg-faint">({tab.count.toLocaleString("en-IN")})</span>
            </Link>
          ))}
        </div>

        <FilterBar clearHref={`/ce/mrs?section=${section}`} active={hasFilters}>
          <label className="min-w-[220px] flex-1 self-start">
            <span className="sr-only">Search customer name or VIN</span>
            <input name="q" defaultValue={query} placeholder="Search name, VIN, contact, or model" className="h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" />
          </label>
          <input type="hidden" name="section" value={section} />
          <MultiSelectFilter label="Allocated dealer" allLabel="All dealers" name="dealer" selected={dealers} options={data.dealers.map((dealer) => ({ value: dealer, label: dealer }))} />
          <MultiSelectFilter label="Workflow" allLabel="All workflows" name="status" selected={statuses} options={CE_STATUSES.map((item) => ({ value: item, label: item }))} />
        </FilterBar>

        <div className="mt-3 text-xs text-fg-faint">{data.total.toLocaleString("en-IN")} lead{data.total === 1 ? "" : "s"}</div>

        {data.rows.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-border-strong bg-surface p-8 text-center text-sm text-fg-subtle">No leads match these filters.</div>
        ) : (
          <>
            <div className="mt-3 hidden overflow-x-auto rounded-lg border border-border bg-surface shadow-card md:block">
              <table className="w-full min-w-[1100px] text-left text-xs">
                <thead className="bg-surface-2 text-[10px] uppercase tracking-wide text-fg-faint"><tr>
                  {["Customer", "Contact", "VIN", "Model", "Allocated dealer", "Last visit", "Due", ...(section === "overdue" ? ["Overdue by"] : []), "Workflow", "Action"].map((label) => (
                    <th key={label} className="px-3 py-2.5 font-semibold">{label}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-border-subtle">
                  {data.rows.map((lead) => (
                    <tr key={lead.vin} className="hover:bg-surface-2/60">
                      <td className="px-3 py-3 font-medium"><Link href={`/ce/leads/${encodeURIComponent(lead.vin)}`} className="text-accent-text underline decoration-transparent underline-offset-2 hover:decoration-current focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{lead.customerName}</Link></td>
                      <td className="px-3 py-3 text-fg-muted"><ContactLink value={lead.contactNumber} /></td>
                      <td className="px-3 py-3 font-mono text-[11px] text-fg-muted">{lead.vin}</td>
                      <td className="px-3 py-3 text-fg-muted">{lead.vehicleModel || "—"}</td>
                      <td className="px-3 py-3 text-fg-muted">{lead.allocatedDealer || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-fg-muted">{formatCeDate(lead.nReportDate)} · {mileage(lead.nMileage)} km</td>
                      <td className="whitespace-nowrap px-3 py-3 text-fg-muted">{formatCeDate(lead.dueDate)}</td>
                      {section === "overdue" ? <td className="px-3 py-3"><OverdueBadge dueDate={lead.dueDate} today={today} /></td> : null}
                      <td className="whitespace-nowrap px-3 py-3 text-fg-muted">{lead.status}</td>
                      <td className="px-3 py-3"><Link href={`/ce/leads/${encodeURIComponent(lead.vin)}`} className="inline-flex h-8 items-center whitespace-nowrap rounded-md border border-border-strong px-3 text-xs font-medium text-fg-muted hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Open lead</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 space-y-2 md:hidden">
              {data.rows.map((lead) => (
                <article key={lead.vin} className="rounded-lg border border-border bg-surface p-4 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div><Link href={`/ce/leads/${encodeURIComponent(lead.vin)}`} className="font-medium text-fg hover:text-accent-text focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{lead.customerName}</Link><div className="mt-0.5 break-all font-mono text-[11px] text-fg-faint">{lead.vin}</div></div>
                    {section === "overdue" ? <OverdueBadge dueDate={lead.dueDate} today={today} /> : <span className="rounded-full bg-warn-soft px-2 py-1 text-[10px] font-semibold text-warn">Priority</span>}
                  </div>
                  <div className="mt-2 text-xs text-fg-muted"><ContactLink value={lead.contactNumber} />{lead.vehicleModel ? <span> · {lead.vehicleModel}</span> : null}</div>
                  <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3 text-xs text-fg-muted"><span>{lead.allocatedDealer || "No dealer"} · {lead.status} · due {formatCeDate(lead.dueDate)}</span><Link href={`/ce/leads/${encodeURIComponent(lead.vin)}`} className="font-medium text-accent-text">Open lead →</Link></div>
                </article>
              ))}
            </div>
          </>
        )}

        {data.pageCount > 1 ? (
          <nav className="mt-5 flex items-center justify-between" aria-label="MRS lead pages">
            {data.page > 1 ? <Link href={href({ ...shared, page: String(data.page - 1) })} className="rounded-md border border-border px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-2">Previous</Link> : <span />}
            <span className="text-xs text-fg-faint">Page {data.page} of {data.pageCount}</span>
            {data.page < data.pageCount ? <Link href={href({ ...shared, page: String(data.page + 1) })} className="rounded-md border border-border px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-2">Next</Link> : <span />}
          </nav>
        ) : null}
      </main>
    </CeShell>
  );
}
