import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";
import { callStatusLabel, formatCeDate, formatCeDateTime, indiaDate } from "@/lib/ce/rules";
import { loadCeLead } from "@/lib/ce/store";
import { CeShell } from "../../ce-shell";
import { UpdateForm } from "./update-form";
import { ContactLink } from "../../contact-link";

const number = (value: number | null) => value === null ? "—" : value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const tones = { hot: "bg-bad-soft text-bad", warm: "bg-warn-soft text-warn", cold: "bg-info-soft text-info" } as const;

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-fg-faint">{label}</dt><dd className="mt-1 text-sm text-fg">{value || "—"}</dd></div>;
}

export default async function CeLeadPage({ params }: { params: Promise<{ vin: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  if (admin.role !== "ce" && admin.role !== "hq") redirect("/");
  const { vin } = await params;
  const data = await loadCeLead(decodeURIComponent(vin), indiaDate());
  if (!data) notFound();
  const { lead, activity } = data;
  const customerName = [lead.customerFirstName, lead.customerFamilyName].filter(Boolean).join(" ") || "Unnamed customer";
  const timeline = [
    { label: "Sale", date: lead.salesDate, dealer: lead.saleDealerCode, mileage: null },
    { label: "N-2", date: lead.n2ReportDate, dealer: lead.n2DealerCode, mileage: lead.n2Mileage },
    { label: "N-1", date: lead.n1ReportDate, dealer: lead.n1DealerCode, mileage: lead.n1Mileage },
    { label: "N", date: lead.nReportDate, dealer: lead.nDealerCode, mileage: lead.nMileage },
  ];

  return (
    <CeShell admin={admin} current="leads">
      <main className="mx-auto w-full max-w-5xl p-4 sm:p-6">
        <Link href={lead.active ? "/ce" : "/ce/archive"} className="text-xs font-medium text-fg-subtle hover:text-accent-text">← {lead.active ? "Active leads" : "Archive"}</Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div><h1 className="text-2xl font-semibold tracking-tight text-fg">{customerName}</h1><p className="mt-1 break-all font-mono text-xs text-fg-subtle">{lead.vin}</p></div>
          <div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${tones[lead.category]}`}>{lead.category}</span>{!lead.active ? <span className="rounded-full bg-surface-3 px-2.5 py-1 text-xs font-semibold text-fg-muted">Archived</span> : null}</div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <section className="rounded-lg border border-border bg-surface p-5 shadow-card"><h2 className="text-sm font-semibold text-fg">Lead summary</h2><dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3"><Field label="Contact" value={<ContactLink value={lead.contactNumber} />} /><Field label="Age" value={`${number(lead.ageDays)} days`} /><Field label="Category" value={<span className="capitalize">{lead.category}</span>} /><Field label="Workflow" value={lead.status} /><Field label="Call attempt" value={lead.attemptCount ? `F${lead.attemptCount}` : "Not called"} /><Field label="Latest result" value={lead.latestCallStatus && lead.latestOutcome ? `${callStatusLabel(lead.latestCallStatus)} · ${lead.latestOutcome}` : "—"} /><Field label="Next follow-up" value={lead.nextFollowUpDate ? formatCeDate(lead.nextFollowUpDate) : "—"} /></dl></section>

            <section className="rounded-lg border border-border bg-surface p-5 shadow-card"><h2 className="text-sm font-semibold text-fg">Vehicle and sale</h2><dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3"><Field label="VIN" value={<span className="break-all font-mono text-xs">{lead.vin}</span>} /><Field label="Model" value={lead.vehicleModel} /><Field label="Delivery / sale date" value={formatCeDate(lead.salesDate)} /><Field label="UIO year" value={lead.uioYear} /><Field label="Sale dealer" value={lead.saleDealerCode} /><Field label="Sale branch" value={lead.saleBranchCode} /><Field label="Latest mileage" value={number(lead.nMileage)} /></dl></section>

            <section className="rounded-lg border border-border bg-surface p-5 shadow-card"><h2 className="text-sm font-semibold text-fg">Allocation and source</h2><dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3"><Field label="Allocated dealer" value={lead.allocatedDealer} /><Field label="Dealer zone" value={lead.dealerZone} /><Field label="AVF" value={number(lead.avf)} /><Field label="Primary source" value={lead.sourceFileName} /><Field label="Imported" value={formatCeDateTime(lead.importedAt)} /><Field label="DMS source" value={lead.dmsSourceFileName ?? "—"} /><Field label="DMS imported" value={lead.dmsImportedAt ? formatCeDateTime(lead.dmsImportedAt) : "—"} /><Field label="Last editor" value={lead.lastEditor ?? "—"} /></dl></section>

            <section className="rounded-lg border border-border bg-surface p-5 shadow-card"><h2 className="text-sm font-semibold text-fg">Service timeline</h2><ol className="mt-4 grid gap-3 sm:grid-cols-4">{timeline.map((item) => <li key={item.label} className="relative rounded-md border border-border bg-surface-2 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-fg-faint">{item.label}</div><div className="mt-1 text-sm font-medium text-fg">{item.date ? formatCeDate(item.date) : "—"}</div><div className="mt-1 text-xs text-fg-subtle">{item.dealer || "No dealer"}</div>{item.mileage !== null ? <div className="mt-2 text-xs tabular-nums text-fg-muted">{number(item.mileage)} km</div> : null}</li>)}</ol></section>
          </div>

          <aside className="space-y-4">
            <section className="rounded-lg border border-border bg-surface p-5 shadow-card"><h2 className="text-sm font-semibold text-fg">CE workflow</h2>{admin.role === "ce" && lead.active ? <UpdateForm key={lead.updatedAt} vin={lead.vin} attemptCount={lead.attemptCount} /> : <p className="mt-3 rounded-md bg-surface-2 p-3 text-xs text-fg-subtle">{lead.active ? "HQ has read-only access to CE workflow." : "Archived leads are read-only."}</p>}</section>
            <section className="rounded-lg border border-border bg-surface p-5 shadow-card"><h2 className="text-sm font-semibold text-fg">Activity</h2>{activity.length ? <ol className="mt-4 space-y-4 border-l border-border pl-4">{activity.map((item) => <li key={item.id}><div className="text-xs font-medium text-fg">{item.attemptNumber && item.callStatus && item.outcome ? `F${item.attemptNumber} · ${callStatusLabel(item.callStatus)} · ${item.outcome}` : item.previousStatus === item.status ? item.status : `${item.previousStatus} → ${item.status}`}</div><p className="mt-1 whitespace-pre-wrap text-sm text-fg-muted">{item.note}</p><div className="mt-1 text-[10px] text-fg-faint">{item.author} · {formatCeDateTime(item.createdAt)}{item.nextFollowUpDate ? ` · ${item.outcome === "Appointment booked" ? "appointment" : "follow-up"} ${formatCeDate(item.nextFollowUpDate)}` : ""}</div></li>)}</ol> : <p className="mt-3 text-xs text-fg-faint">No activity recorded yet.</p>}</section>
          </aside>
        </div>
      </main>
    </CeShell>
  );
}
