import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";
import { callStatusLabel, formatCeDate, formatCeDateTime } from "@/lib/ce/rules";
import { loadConquestLead } from "@/lib/ce/conquest-store";
import { loadReportHolidaySet } from "@/lib/report-holidays/store";
import { CeShell } from "../../ce-shell";
import { ContactLink } from "../../contact-link";
import { UpdateForm } from "./update-form";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-fg-faint">{label}</dt><dd className="mt-1 text-sm text-fg">{value || "—"}</dd></div>;
}

export default async function CeConquestLeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  if (admin.role !== "ce_head" && admin.role !== "ce_agent" && admin.role !== "hq") redirect("/");
  const { id } = await params;
  const data = await loadConquestLead(id);
  if (!data) notFound();
  const { lead, activity } = data;
  if (admin.role === "ce_agent" && lead.assignedTo !== admin.username) notFound();

  const canEdit = admin.role === "ce_head" || admin.role === "ce_agent";
  const holidays = canEdit ? [...(await loadReportHolidaySet())] : [];
  // Honors wherever the visitor actually came from (the list's search/
  // status/PM-month filters and page) instead of always bouncing back to
  // the default view — only trusts an internal /ce/conquest path, never an
  // arbitrary redirect target (2026-11-13, at the user's request — opening
  // a lead from December and coming back used to drop you on the current
  // month instead).
  const { from } = await searchParams;
  const backHref = from && from.startsWith("/ce/conquest") ? from : "/ce/conquest";

  return (
    <CeShell admin={admin} current="conquest">
      <main className="mx-auto w-full max-w-5xl p-4 sm:p-6">
        <Link href={backHref} className="text-xs font-medium text-fg-subtle hover:text-accent-text">← Conquest leads</Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div><h1 className="text-2xl font-semibold tracking-tight text-fg">{lead.ownerName || "Unnamed owner"}</h1><p className="mt-1 font-mono text-xs text-fg-subtle">{lead.registrationNo}</p></div>
          <span className="rounded-full bg-surface-3 px-2.5 py-1 text-xs font-semibold text-fg-muted">{lead.status}</span>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <section className="rounded-lg border border-border bg-surface p-5 shadow-card">
              <h2 className="text-sm font-semibold text-fg">Lead summary</h2>
              <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Field label="Contact" value={<ContactLink value={lead.ownerMobile} />} />
                <Field label="Workflow" value={lead.status} />
                <Field label="Call attempt" value={lead.attemptCount ? `F${lead.attemptCount}` : "Not called"} />
                <Field label="Next follow-up" value={lead.nextFollowUpDate ? formatCeDate(lead.nextFollowUpDate) : "—"} />
                {admin.role === "ce_head" || admin.role === "hq" ? <Field label="Assigned to" value={lead.assignedTo ?? "Unassigned"} /> : null}
                <Field label="Source" value={lead.sourceFile} />
              </dl>
            </section>

            <section className="rounded-lg border border-border bg-surface p-5 shadow-card">
              <h2 className="text-sm font-semibold text-fg">Vehicle</h2>
              <p className="mt-1 text-xs text-fg-faint">From an external vehicle-registration record — no service history with us on file for this vehicle.</p>
              <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Field label="Registration no" value={<span className="font-mono text-xs">{lead.registrationNo}</span>} />
                <Field label="VIN" value={lead.vin ? <span className="break-all font-mono text-xs">{lead.vin}</span> : "Not on file"} />
                <Field label="Model" value={lead.vehicleModel} />
                <Field label="Maker" value={lead.vehicleMaker} />
                <Field label="Registration date" value={lead.registrationDate ? formatCeDate(lead.registrationDate) : "—"} />
              </dl>
              {lead.address ? <p className="mt-4 text-xs text-fg-subtle">{lead.address}</p> : null}
            </section>
          </div>

          <aside className="space-y-4">
            <section className="rounded-lg border border-border bg-surface p-5 shadow-card">
              <h2 className="text-sm font-semibold text-fg">CE workflow</h2>
              {canEdit ? <UpdateForm key={lead.nextFollowUpDate ?? lead.status} id={lead.id} attemptCount={lead.attemptCount} holidays={holidays} /> : <p className="mt-3 rounded-md bg-surface-2 p-3 text-xs text-fg-subtle">HQ has read-only access to CE workflow.</p>}
            </section>
            <section className="rounded-lg border border-border bg-surface p-5 shadow-card">
              <h2 className="text-sm font-semibold text-fg">Activity</h2>
              {activity.length ? (
                <ol className="mt-4 space-y-4 border-l border-border pl-4">
                  {activity.map((item) => (
                    <li key={item.id}>
                      <div className="text-xs font-medium text-fg">{item.attemptNumber && item.callStatus && item.outcome ? `F${item.attemptNumber} · ${callStatusLabel(item.callStatus)} · ${item.outcome}` : item.previousStatus === item.status ? item.status : `${item.previousStatus} → ${item.status}`}</div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-fg-muted">{item.note}</p>
                      <div className="mt-1 text-[10px] text-fg-faint">{item.author} · {formatCeDateTime(item.createdAt)}{item.nextFollowUpDate ? ` · ${item.outcome === "Appointment booked" ? "appointment" : "follow-up"} ${formatCeDate(item.nextFollowUpDate)}` : ""}</div>
                    </li>
                  ))}
                </ol>
              ) : <p className="mt-3 text-xs text-fg-faint">No activity recorded yet.</p>}
            </section>
          </aside>
        </div>
      </main>
    </CeShell>
  );
}
