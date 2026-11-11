import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";
import { CE_FOLLOW_UP_FILTERS, CE_STATUSES, formatCeDate, indiaDate, type CeFollowUpFilter, type CeStatus } from "@/lib/ce/rules";
import { loadConquestLeadPage } from "@/lib/ce/conquest-store";
import { CeShell } from "../ce-shell";
import { FilterBar, MultiSelectFilter } from "../filter-bar";
import { ContactLink } from "../contact-link";
import { SelectAllCheckbox } from "../select-all-checkbox";
import { assignConquestLeadsEvenlyAction } from "./actions";

// "MRS follow-up already scheduled" never applies here — these leads were
// never on an MRS list in the first place.
const CONQUEST_STATUSES: CeStatus[] = CE_STATUSES.filter((s) => s !== "MRS follow-up already scheduled");

const PM_MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Params = { q?: string | string[]; status?: string | string[]; followUp?: string | string[]; pmMonth?: string | string[]; page?: string | string[]; assigned?: string | string[]; assignError?: string | string[] };
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const many = (value: string | string[] | undefined) => (Array.isArray(value) ? value : value ? [value] : []).slice(0, 100);

function href(params: Record<string, string | string[] | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((item) => search.append(key, item));
    else if (value) search.set(key, value);
  }
  return `/ce/conquest${search.size ? `?${search}` : ""}`;
}

/** Wraps the lead rows in the "Assign evenly" bulk-assign form for a CE
 * head, same pattern as the MRS catch list's AssignableRows. */
function AssignableRows({ canAssign, returnTo, children }: { canAssign: boolean; returnTo: string; children: React.ReactNode }) {
  if (!canAssign) return <>{children}</>;
  return (
    <form action={assignConquestLeadsEvenlyAction}>
      <input type="hidden" name="returnTo" value={returnTo} />
      {children}
      <button type="submit" className="mt-3 inline-flex h-9 items-center rounded-md border border-border-strong bg-surface px-4 text-xs font-medium text-fg hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        Assign evenly to your team
      </button>
    </form>
  );
}

export default async function CeConquestPage({ searchParams }: { searchParams: Promise<Params> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  if (admin.role !== "ce_head" && admin.role !== "ce_agent" && admin.role !== "hq") redirect("/");
  const canAssign = admin.role === "ce_head";
  const showAssignedTo = admin.role === "ce_head" || admin.role === "hq";
  const assignedTo = admin.role === "ce_agent" ? admin.username : undefined;

  const raw = await searchParams;
  const query = one(raw.q)?.trim().slice(0, 100) || undefined;
  const statuses = many(raw.status).filter((item): item is CeStatus => CONQUEST_STATUSES.includes(item as CeStatus));
  const followUps = many(raw.followUp).filter((item): item is CeFollowUpFilter => CE_FOLLOW_UP_FILTERS.includes(item as CeFollowUpFilter));
  const today = indiaDate();
  // Defaults to the current calendar month (2026-11-11, at the user's
  // request) so the view never opens on the full 24,000+ pile — "0" is the
  // explicit "All months" choice, distinct from the param being absent
  // entirely (a fresh visit), which is what actually triggers this default.
  const todayMonth = Number(today.slice(5, 7));
  const selectedMonth = raw.pmMonth === undefined ? todayMonth : Math.min(12, Math.max(0, Number.parseInt(one(raw.pmMonth) ?? "0", 10) || 0));
  const pmMonths = selectedMonth === 0 ? undefined : [selectedMonth];
  const page = Math.max(1, Number.parseInt(one(raw.page) ?? "1", 10) || 1);
  const assignedCount = Number.parseInt(one(raw.assigned) ?? "", 10);
  const assignError = one(raw.assignError);
  const data = await loadConquestLeadPage({ today, query, statuses, followUps, pmMonths, assignedTo, page });
  const shared = { q: query, status: statuses, followUp: followUps, pmMonth: String(selectedMonth) };
  const hasFilters = Boolean(query || statuses.length || followUps.length);
  const backTo = href({ ...shared, page: data.page > 1 ? String(data.page) : undefined });

  return (
    <CeShell admin={admin} current="conquest">
      <main className="mx-auto w-full max-w-[1500px] p-4 sm:p-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-faint">Customer Engagement</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-fg">Conquest leads</h1>
          <p className="mt-1 text-sm text-fg-subtle">
            Toyota/Lexus owners found in external vehicle-registration records who&apos;ve never shown up in our own history — no service visit, no N-9 list, ever.
            Cold outreach, not a reminder for an existing customer — worth a call to bring them in.
          </p>
        </div>

        <div className="mt-4">
          <p className="text-xs text-fg-subtle">
            PM month — no mileage or service history exists for these vehicles, so this is the calendar month of each one&apos;s registration anniversary (repeating every year), not TKM&apos;s real per-model schedule — just an even way to pace outreach across the year instead of one 24,000-lead pile.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Link
              href={href({ ...shared, pmMonth: "0", page: undefined })}
              aria-current={selectedMonth === 0 ? "page" : undefined}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${selectedMonth === 0 ? "border-accent bg-accent-soft text-accent-text" : "border-border-strong text-fg-muted hover:bg-surface-2"}`}
            >
              All <span className="tabular-nums text-fg-faint">({data.totalCount.toLocaleString("en-IN")})</span>
            </Link>
            {PM_MONTH_LABELS.map((label, index) => {
              const monthNum = index + 1;
              const count = data.pmMonthCounts[monthNum] ?? 0;
              return (
                <Link
                  key={monthNum}
                  href={href({ ...shared, pmMonth: String(monthNum), page: undefined })}
                  aria-current={selectedMonth === monthNum ? "page" : undefined}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${selectedMonth === monthNum ? "border-accent bg-accent-soft text-accent-text" : "border-border-strong text-fg-muted hover:bg-surface-2"} ${monthNum === todayMonth ? "ring-1 ring-accent/40" : ""}`}
                >
                  {label} <span className="tabular-nums text-fg-faint">({count.toLocaleString("en-IN")})</span>
                </Link>
              );
            })}
          </div>
        </div>

        <FilterBar clearHref={href({ pmMonth: String(selectedMonth) })} active={hasFilters}>
          <label className="min-w-[220px] flex-1 self-start">
            <span className="sr-only">Search name, registration, VIN, or mobile</span>
            <input name="q" defaultValue={query} placeholder="Search name, registration, VIN, or mobile" className="h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" />
          </label>
          <input type="hidden" name="pmMonth" value={String(selectedMonth)} />
          <MultiSelectFilter label="Workflow" allLabel="All workflows" name="status" selected={statuses} options={CONQUEST_STATUSES.map((item) => ({ value: item, label: item }))} />
          <MultiSelectFilter label="Follow-up" allLabel="All follow-ups" name="followUp" selected={followUps} options={[{ value: "due", label: "Due" }, { value: "upcoming", label: "Upcoming" }, { value: "none", label: "No follow-up set" }]} />
        </FilterBar>

        <div className="mt-3 text-xs text-fg-faint">{data.total.toLocaleString("en-IN")} of {data.totalCount.toLocaleString("en-IN")} lead{data.totalCount === 1 ? "" : "s"}</div>

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
                  {canAssign ? <th className="px-3 py-2.5 font-semibold"><SelectAllCheckbox name="id" className="h-3.5 w-3.5 accent-[var(--color-accent)]" /></th> : null}
                  {["Owner", "Contact", "Registration", "VIN", "Model", "Registered", "Workflow", ...(showAssignedTo ? ["Assigned to"] : []), "Action"].map((label) => (
                    <th key={label} className="px-3 py-2.5 font-semibold">{label}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-border-subtle">
                  {data.rows.map((lead) => (
                    <tr key={lead.id} className="hover:bg-surface-2/60">
                      {canAssign ? <td className="px-3 py-3"><input type="checkbox" name="id" value={lead.id} className="h-3.5 w-3.5 accent-[var(--color-accent)]" /></td> : null}
                      <td className="px-3 py-3 font-medium"><Link href={`/ce/conquest/${lead.id}`} className="text-accent-text underline decoration-transparent underline-offset-2 hover:decoration-current focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{lead.ownerName || "Unnamed owner"}</Link></td>
                      <td className="px-3 py-3 text-fg-muted"><ContactLink value={lead.ownerMobile} /></td>
                      <td className="px-3 py-3 font-mono text-[11px] text-fg-muted">{lead.registrationNo}</td>
                      <td className="px-3 py-3 font-mono text-[11px] text-fg-muted">{lead.vin || "—"}</td>
                      <td className="px-3 py-3 text-fg-muted">{lead.vehicleModel || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-fg-muted">{lead.registrationDate ? formatCeDate(lead.registrationDate) : "—"}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-fg-muted">{lead.status}</td>
                      {showAssignedTo ? <td className="whitespace-nowrap px-3 py-3 text-fg-muted">{lead.assignedTo ?? "—"}</td> : null}
                      <td className="px-3 py-3"><Link href={`/ce/conquest/${lead.id}`} className="inline-flex h-8 items-center whitespace-nowrap rounded-md border border-border-strong px-3 text-xs font-medium text-fg-muted hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Open lead</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 space-y-2 md:hidden">
              {canAssign ? <label className="flex items-center gap-2 text-xs font-medium text-fg-muted"><SelectAllCheckbox name="id" className="h-3.5 w-3.5 accent-[var(--color-accent)]" /> Select all</label> : null}
              {data.rows.map((lead) => (
                <article key={lead.id} className="rounded-lg border border-border bg-surface p-4 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      {canAssign ? <input type="checkbox" name="id" value={lead.id} className="mt-1 h-3.5 w-3.5 accent-[var(--color-accent)]" /> : null}
                      <div><Link href={`/ce/conquest/${lead.id}`} className="font-medium text-fg hover:text-accent-text focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{lead.ownerName || "Unnamed owner"}</Link><div className="mt-0.5 font-mono text-[11px] text-fg-faint">{lead.registrationNo}</div></div>
                    </div>
                    <span className="rounded-full bg-surface-2 px-2 py-1 text-[10px] font-semibold text-fg-muted">{lead.status}</span>
                  </div>
                  <div className="mt-2 text-xs text-fg-muted"><ContactLink value={lead.ownerMobile} />{lead.vehicleModel ? <span> · {lead.vehicleModel}</span> : null}</div>
                  <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3 text-xs text-fg-muted"><span>{lead.registrationDate ? formatCeDate(lead.registrationDate) : "No reg. date"}{showAssignedTo ? ` · ${lead.assignedTo ?? "unassigned"}` : ""}</span><Link href={`/ce/conquest/${lead.id}`} className="font-medium text-accent-text">Open lead →</Link></div>
                </article>
              ))}
            </div>
          </AssignableRows>
        )}

        {data.pageCount > 1 ? (
          <nav className="mt-5 flex items-center justify-between" aria-label="Conquest lead pages">
            {data.page > 1 ? <Link href={href({ ...shared, page: String(data.page - 1) })} className="rounded-md border border-border px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-2">Previous</Link> : <span />}
            <span className="text-xs text-fg-faint">Page {data.page} of {data.pageCount}</span>
            {data.page < data.pageCount ? <Link href={href({ ...shared, page: String(data.page + 1) })} className="rounded-md border border-border px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-2">Next</Link> : <span />}
          </nav>
        ) : null}
      </main>
    </CeShell>
  );
}
