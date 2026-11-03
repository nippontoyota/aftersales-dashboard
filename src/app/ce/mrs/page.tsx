import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";
import { CE_STATUSES, dateAgeInDays, formatCeDate, indiaDate, type CeStatus } from "@/lib/ce/rules";
import { loadCeMrsGapList } from "@/lib/ce/store";
import { CE_VEHICLE_BRANDS, type CeVehicleBrand } from "@/lib/ce/vehicle-brand";
import { CeShell } from "../ce-shell";
import { BrandFilter, FilterBar, MultiSelectFilter } from "../filter-bar";
import { ContactLink } from "../contact-link";
import { assignCeLeadsEvenlyAction } from "../actions";
import { SelectAllCheckbox } from "../select-all-checkbox";

type Section = "priority" | "overdue";
type Stage = "new" | "followup";
type Params = { section?: string | string[]; stage?: string | string[]; q?: string | string[]; dealer?: string | string[]; status?: string | string[]; brand?: string | string[]; page?: string | string[]; assigned?: string | string[]; assignError?: string | string[] };
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const many = (value: string | string[] | undefined) => (Array.isArray(value) ? value : value ? [value] : []).slice(0, 100);
const mileage = (value: number) => value.toLocaleString("en-IN", { maximumFractionDigits: 0 });

function searchString(params: Record<string, string | string[] | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((item) => search.append(key, item));
    else if (value) search.set(key, value);
  }
  return search.size ? `?${search}` : "";
}

function href(params: Record<string, string | string[] | undefined>) {
  return `/ce/mrs${searchString(params)}`;
}

function DownloadIcon() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5" aria-hidden="true"><path d="M8 2v8m0 0 3-3m-3 3-3-3M2.5 11.5V13a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function OverdueBadge({ dueDate, today }: { dueDate: string; today: string }) {
  const days = dateAgeInDays(dueDate, today);
  return <span className="rounded-full bg-bad-soft px-2 py-1 text-[10px] font-semibold text-bad">Overdue {days}d</span>;
}

/** Wraps the lead rows in the "Assign evenly" bulk-assign form for a CE
 * head (checkboxes submit as repeated name="vin" fields — no client JS
 * needed to collect the selection); every other role gets the rows as-is. */
function AssignableRows({ canAssign, returnTo, children }: { canAssign: boolean; returnTo: string; children: React.ReactNode }) {
  if (!canAssign) return <>{children}</>;
  return (
    <form action={assignCeLeadsEvenlyAction}>
      <input type="hidden" name="returnTo" value={returnTo} />
      {children}
      <button type="submit" className="mt-3 inline-flex h-9 items-center rounded-md border border-border-strong bg-surface px-4 text-xs font-medium text-fg hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        Assign evenly to your team
      </button>
    </form>
  );
}

export default async function CeMrsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  if (admin.role !== "ce_head" && admin.role !== "ce_agent" && admin.role !== "hq") redirect("/");
  const canAssign = admin.role === "ce_head";
  const showAssignedTo = admin.role === "ce_head" || admin.role === "hq";
  const assignedTo = admin.role === "ce_agent" ? admin.username : undefined;

  const raw = await searchParams;
  const section: Section = one(raw.section) === "overdue" ? "overdue" : "priority";
  const stage: Stage = one(raw.stage) === "followup" ? "followup" : "new";
  const query = one(raw.q)?.trim().slice(0, 100) || undefined;
  const dealers = many(raw.dealer);
  const statuses = many(raw.status).filter((item): item is CeStatus => CE_STATUSES.includes(item as CeStatus));
  const brandValue = one(raw.brand);
  const brand = CE_VEHICLE_BRANDS.includes(brandValue as CeVehicleBrand) ? (brandValue as CeVehicleBrand) : undefined;
  const page = Math.max(1, Number.parseInt(one(raw.page) ?? "1", 10) || 1);
  const assignedCount = Number.parseInt(one(raw.assigned) ?? "", 10);
  const assignError = one(raw.assignError);
  const today = indiaDate();
  const data = await loadCeMrsGapList({ today, section, stage, query, dealers, statuses, brand, assignedTo, page });
  const shared = { section, stage, q: query, dealer: dealers, status: statuses, brand };
  const hasFilters = Boolean(query || dealers.length || statuses.length || brand);
  const backTo = href({ ...shared, page: data.page > 1 ? String(data.page) : undefined });
  const leadHref = (vin: string) => `/ce/leads/${encodeURIComponent(vin)}?from=${encodeURIComponent(backTo)}`;

  const tabs: { key: Section; label: string; count: number }[] = [
    { key: "priority", label: "Priority", count: data.priorityCount },
    { key: "overdue", label: "Overdue", count: data.overdueCount },
  ];
  const stageTabs: { key: Stage; label: string; count: number }[] = [
    { key: "new", label: "New", count: data.newCount },
    { key: "followup", label: "Follow-ups", count: data.followUpCount },
  ];
  // Workflow dropdown is redundant on "New" (every row is already status
  // New) and would let a stage/status combo contradict itself and return
  // nothing — so it only shows on "Follow-ups", with "New" excluded.
  const workflowFilterOptions = CE_STATUSES.filter((item) => item !== "New");

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
              href={href({ section: tab.key, stage, q: query, dealer: dealers, status: statuses, brand })}
              aria-current={section === tab.key ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${section === tab.key ? "border-accent text-accent-text" : "border-transparent text-fg-muted hover:text-fg"}`}
            >
              {tab.label} <span className="tabular-nums text-fg-faint">({tab.count.toLocaleString("en-IN")})</span>
            </Link>
          ))}
        </div>

        <div className="mt-3 flex gap-2">
          {stageTabs.map((tab) => (
            <Link
              key={tab.key}
              href={href({ section, stage: tab.key, q: query, dealer: dealers, status: tab.key === "new" ? [] : statuses, brand })}
              aria-current={stage === tab.key ? "page" : undefined}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${stage === tab.key ? "border-accent bg-accent-soft text-accent-text" : "border-border-strong text-fg-muted hover:bg-surface-2"}`}
            >
              {tab.label} <span className="tabular-nums text-fg-faint">({tab.count.toLocaleString("en-IN")})</span>
            </Link>
          ))}
          <span className="self-center text-xs text-fg-faint">
            {stage === "new" ? "Never contacted yet — work these first." : "Already attempted at least once."}
          </span>
        </div>

        <FilterBar clearHref={`/ce/mrs?section=${section}&stage=${stage}`} active={hasFilters}>
          <label className="min-w-[220px] flex-1 self-start">
            <span className="sr-only">Search customer name or VIN</span>
            <input name="q" defaultValue={query} placeholder="Search name, VIN, contact, or model" className="h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" />
          </label>
          <input type="hidden" name="section" value={section} />
          <input type="hidden" name="stage" value={stage} />
          <BrandFilter value={brand} />
          <MultiSelectFilter label="Allocated dealer" allLabel="All dealers" name="dealer" selected={dealers} options={data.dealers.map((dealer) => ({ value: dealer, label: dealer }))} />
          {stage === "followup" ? (
            <MultiSelectFilter label="Workflow" allLabel="All workflows" name="status" selected={statuses} options={workflowFilterOptions.map((item) => ({ value: item, label: item }))} />
          ) : null}
        </FilterBar>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-xs text-fg-faint">{data.total.toLocaleString("en-IN")} lead{data.total === 1 ? "" : "s"}</div>
          <a
            href={`/api/ce/mrs-export${searchString(shared)}`}
            className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border border-border-strong px-3 text-xs font-medium text-fg-muted hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <DownloadIcon /> Download Excel
          </a>
        </div>

        {Number.isFinite(assignedCount) ? (
          <div className="mt-3 rounded-md border border-good-soft bg-good-soft px-3 py-2 text-xs font-medium text-good">Assigned {assignedCount} lead{assignedCount === 1 ? "" : "s"} evenly across your team.</div>
        ) : assignError ? (
          <div className="mt-3 rounded-md border border-bad-soft bg-bad-soft px-3 py-2 text-xs font-medium text-bad">{assignError}</div>
        ) : null}

        {data.rows.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-border-strong bg-surface p-8 text-center text-sm text-fg-subtle">No leads match these filters.</div>
        ) : (
          <AssignableRows canAssign={canAssign} returnTo={backTo}>
            <div className="mt-3 hidden overflow-x-auto rounded-lg border border-border bg-surface shadow-card md:block">
              <table className="w-full min-w-[1100px] text-left text-xs">
                <thead className="bg-surface-2 text-[10px] uppercase tracking-wide text-fg-faint"><tr>
                  {canAssign ? <th className="px-3 py-2.5 font-semibold"><SelectAllCheckbox className="h-3.5 w-3.5 accent-[var(--color-accent)]" /></th> : null}
                  {["Customer", "Contact", "VIN", "Model", "Allocated dealer", "Last visit", "Due", ...(section === "overdue" ? ["Overdue by"] : []), "Workflow", ...(showAssignedTo ? ["Assigned to"] : []), "Action"].map((label) => (
                    <th key={label} className="px-3 py-2.5 font-semibold">{label}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-border-subtle">
                  {data.rows.map((lead) => (
                    <tr key={lead.vin} className="hover:bg-surface-2/60">
                      {canAssign ? <td className="px-3 py-3"><input type="checkbox" name="vin" value={lead.vin} className="h-3.5 w-3.5 accent-[var(--color-accent)]" /></td> : null}
                      <td className="px-3 py-3 font-medium"><Link href={leadHref(lead.vin)} className="text-accent-text underline decoration-transparent underline-offset-2 hover:decoration-current focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{lead.customerName}</Link></td>
                      <td className="px-3 py-3 text-fg-muted"><ContactLink value={lead.contactNumber} /></td>
                      <td className="px-3 py-3 font-mono text-[11px] text-fg-muted">{lead.vin}</td>
                      <td className="px-3 py-3 text-fg-muted">{lead.vehicleModel || "—"}</td>
                      <td className="px-3 py-3 text-fg-muted">{lead.allocatedDealer || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-fg-muted">{formatCeDate(lead.nReportDate)} · {mileage(lead.nMileage)} km</td>
                      <td className="whitespace-nowrap px-3 py-3 text-fg-muted">{formatCeDate(lead.dueDate)}</td>
                      {section === "overdue" ? <td className="px-3 py-3"><OverdueBadge dueDate={lead.dueDate} today={today} /></td> : null}
                      <td className="whitespace-nowrap px-3 py-3 text-fg-muted">{lead.status}</td>
                      {showAssignedTo ? <td className="whitespace-nowrap px-3 py-3 text-fg-muted">{lead.assignedTo ?? "—"}</td> : null}
                      <td className="px-3 py-3"><Link href={leadHref(lead.vin)} className="inline-flex h-8 items-center whitespace-nowrap rounded-md border border-border-strong px-3 text-xs font-medium text-fg-muted hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Open lead</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 space-y-2 md:hidden">
              {canAssign ? <label className="flex items-center gap-2 text-xs font-medium text-fg-muted"><SelectAllCheckbox className="h-3.5 w-3.5 accent-[var(--color-accent)]" /> Select all</label> : null}
              {data.rows.map((lead) => (
                <article key={lead.vin} className="rounded-lg border border-border bg-surface p-4 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      {canAssign ? <input type="checkbox" name="vin" value={lead.vin} className="mt-1 h-3.5 w-3.5 accent-[var(--color-accent)]" /> : null}
                      <div><Link href={leadHref(lead.vin)} className="font-medium text-fg hover:text-accent-text focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{lead.customerName}</Link><div className="mt-0.5 break-all font-mono text-[11px] text-fg-faint">{lead.vin}</div></div>
                    </div>
                    {section === "overdue" ? <OverdueBadge dueDate={lead.dueDate} today={today} /> : <span className="rounded-full bg-warn-soft px-2 py-1 text-[10px] font-semibold text-warn">Priority</span>}
                  </div>
                  <div className="mt-2 text-xs text-fg-muted"><ContactLink value={lead.contactNumber} />{lead.vehicleModel ? <span> · {lead.vehicleModel}</span> : null}</div>
                  <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3 text-xs text-fg-muted"><span>{lead.allocatedDealer || "No dealer"} · {lead.status} · due {formatCeDate(lead.dueDate)}{showAssignedTo ? ` · ${lead.assignedTo ?? "unassigned"}` : ""}</span><Link href={leadHref(lead.vin)} className="font-medium text-accent-text">Open lead →</Link></div>
                </article>
              ))}
            </div>
          </AssignableRows>
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
