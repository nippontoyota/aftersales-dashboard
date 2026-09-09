import { AppShell } from "@/components/app-shell";
import { adminIdentityLabel } from "@/lib/admin-store";
import { listSnapshotDates } from "@/lib/snapshot-store";
import { listVpFlags } from "@/lib/vp-flags/store";
import { FlagComposer } from "../flag-composer";
import { requireVpAccess } from "../vp-guard";
import { VpFlagThread } from "../vp-flag-thread";
import { VpHeader } from "../vp-header";

export default async function VpQueriesPage() {
  const admin = await requireVpAccess();
  const isHq = admin.role === "hq";
  const [flags, dates] = await Promise.all([listVpFlags(), listSnapshotDates()]);
  const latestDate = dates.at(-1) ?? new Date().toISOString().slice(0, 10);

  const open = flags.filter((f) => f.status !== "closed");
  const closed = flags.filter((f) => f.status === "closed");
  const canManage = isHq || admin.role === "vp_service";

  return (
    <AppShell current="vp-queries" showDashboardLink vpNav identity={adminIdentityLabel(admin)}>
      <div className="mx-auto max-w-3xl px-6 py-8">
        <VpHeader
          eyebrow="Nippon Group · Service"
          title="Queries"
          subtitle={
            isHq
              ? "Questions the VP has raised from the dashboard — reply here and the VP sees it."
              : "Questions you've raised, and HQ's replies. Flag any figure on the other pages to add one."
          }
          flagHref="/vp/queries?flag=1"
        />

        {flags.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface p-8 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-fg-subtle">
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M4 4.5h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H8l-3.5 3v-3H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="mt-3 text-sm text-fg-subtle">
              {isHq ? "No queries yet." : "No queries yet — flag any figure to ask HQ about it."}
            </p>
          </div>
        ) : (
          <>
            <div className="mt-6 space-y-3">
              {open.map((f) => (
                <VpFlagThread key={f.id} flag={f} canReply={isHq} canManage={canManage} />
              ))}
            </div>
            {closed.length > 0 ? (
              <>
                <h2 className="mt-8 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">Resolved</h2>
                <div className="mt-3 space-y-3">
                  {closed.map((f) => (
                    <VpFlagThread key={f.id} flag={f} canReply={false} canManage={canManage} />
                  ))}
                </div>
              </>
            ) : null}
          </>
        )}
      </div>

      <FlagComposer page="overview" date={latestDate} />
    </AppShell>
  );
}
