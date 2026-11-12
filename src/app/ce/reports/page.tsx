import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";
import { formatCeDate, indiaDate, isValidIsoDate } from "@/lib/ce/rules";
import { loadCeCallPerformance, type CeCallPerformanceDay } from "@/lib/ce/report-store";
import { CeShell } from "../ce-shell";

type Params = { from?: string | string[]; to?: string | string[] };
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function pct(numerator: number, denominator: number): string {
  return denominator > 0 ? `${((numerator / denominator) * 100).toFixed(1)}%` : "—";
}

function addDaysIso(dateIso: string, days: number): string {
  return new Date(Date.parse(`${dateIso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function Row({ day, isTotal }: { day: CeCallPerformanceDay; isTotal?: boolean }) {
  return (
    <tr className={isTotal ? "bg-surface-2 font-semibold" : "hover:bg-surface-2/60"}>
      <td className="whitespace-nowrap px-3 py-3 text-fg">{isTotal ? "Total" : formatCeDate(day.date)}</td>
      <td className="px-3 py-3 text-right tabular-nums text-fg-muted">{day.attempted.toLocaleString("en-IN")}</td>
      <td className="px-3 py-3 text-right tabular-nums text-fg-muted">{day.connected.toLocaleString("en-IN")}</td>
      <td className="px-3 py-3 text-right tabular-nums text-fg-muted">{pct(day.connected, day.attempted)}</td>
      <td className="px-3 py-3 text-right tabular-nums text-fg-muted">{day.appointments.toLocaleString("en-IN")}</td>
      <td className="px-3 py-3 text-right tabular-nums text-fg-muted">{pct(day.appointments, day.connected)}</td>
      <td className="px-3 py-3 text-right tabular-nums text-fg-faint">{pct(day.appointments, day.attempted)}</td>
    </tr>
  );
}

export default async function CeReportsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  if (admin.role !== "ce_head" && admin.role !== "ce_agent" && admin.role !== "hq") redirect("/");

  const today = indiaDate();
  const raw = await searchParams;
  const fromRaw = one(raw.from);
  const toRaw = one(raw.to);
  const endDate = toRaw && isValidIsoDate(toRaw) && toRaw <= today ? toRaw : today;
  const startDate = fromRaw && isValidIsoDate(fromRaw) && fromRaw <= endDate ? fromRaw : addDaysIso(endDate, -29);

  const data = await loadCeCallPerformance({ startDate, endDate });

  return (
    <CeShell admin={admin} current="reports">
      <main className="mx-auto w-full max-w-[1200px] p-4 sm:p-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-faint">Customer Engagement</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-fg">Call performance</h1>
          <p className="mt-1 text-sm text-fg-subtle">
            Every real call logged each day — across the main leads page, the MRS catch list, and Conquest leads — with how many connected and how many of those turned into a booked appointment.
          </p>
        </div>

        <form className="mt-4 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface p-3 shadow-card">
          <label className="text-xs text-fg-muted">
            <span className="block font-medium">From</span>
            <input type="date" name="from" defaultValue={startDate} max={endDate} className="mt-1 h-9 rounded-md border border-border-strong bg-surface px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" />
          </label>
          <label className="text-xs text-fg-muted">
            <span className="block font-medium">To</span>
            <input type="date" name="to" defaultValue={endDate} max={today} className="mt-1 h-9 rounded-md border border-border-strong bg-surface px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" />
          </label>
          <button type="submit" className="h-9 rounded-md border border-border-strong bg-surface px-4 text-xs font-medium text-fg hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            Apply
          </button>
          <a
            href={`/api/ce/reports-export?from=${startDate}&to=${endDate}`}
            className="h-9 inline-flex items-center rounded-md border border-border-strong px-4 text-xs font-medium text-fg-muted hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Download Excel
          </a>
        </form>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-fg-faint">Calls logged</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-fg">{data.totals.attempted.toLocaleString("en-IN")}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-fg-faint">Connected</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-fg">{data.totals.connected.toLocaleString("en-IN")} <span className="text-sm font-normal text-fg-faint">({pct(data.totals.connected, data.totals.attempted)})</span></div>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-fg-faint">Appointments</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-fg">{data.totals.appointments.toLocaleString("en-IN")} <span className="text-sm font-normal text-fg-faint">({pct(data.totals.appointments, data.totals.connected)} of connected)</span></div>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-fg-faint">Overall conversion</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-fg">{pct(data.totals.appointments, data.totals.attempted)} <span className="text-sm font-normal text-fg-faint">of all calls</span></div>
          </div>
        </div>

        {data.days.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border-strong bg-surface p-8 text-center text-sm text-fg-subtle">No calls logged in this date range.</div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-surface shadow-card">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-surface-2 text-[10px] uppercase tracking-wide text-fg-faint"><tr>
                {["Date", "Calls logged", "Connected", "Connected %", "Appointments", "Appt % of connected", "Appt % of all calls"].map((label, i) => (
                  <th key={label} className={`px-3 py-2.5 font-semibold ${i > 0 ? "text-right" : ""}`}>{label}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-border-subtle">
                <Row day={data.totals} isTotal />
                {data.days.map((day) => <Row key={day.date} day={day} />)}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </CeShell>
  );
}
