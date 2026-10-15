"use client";

import { useActionState, useMemo, useState } from "react";
import { control, eyebrow } from "@/lib/ui";
import { branchName } from "@/lib/branch-names";
import {
  logFollowUpContactAction,
  markNotConnectedAction,
  submitCallOutcomeAction,
  transferReferralAction,
  type BpmActionState,
} from "./bpm-actions";

export type BpmQueueReferral = {
  id: number;
  referring_employee_id: string | null;
  referring_employee_name: string | null;
  referring_employee_branch: string | null;
  vehicle_image_url: string | null;
  customer_phone: string | null;
  submitted_at: Date | string | null;
  vehicle_reg_no: string | null;
  location: string | null;
  description: string | null;
  assigned_branch: string | null;
  call_status: "pending" | "not_connected" | "connected";
  genuine: boolean | null;
  estimate_amount: string | null;
  customer_interested: boolean | null;
  payment_type: "CP" | "IP" | null;
  validated_at: Date | string | null;
  handled_by: string | null;
  matched_ro_no: string | null;
  ro_matched_at: Date | string | null;
  closed_at: Date | string | null;
  closed_reason: "not_genuine" | "not_interested" | null;
  last_contacted_at: Date | string | null;
  transferred_from: string | null;
};

type Tab = "active" | "followup" | "completed" | "closed";

function fmt(ts: Date | string | null): string {
  if (!ts) return "—";
  const d = new Date(ts as string);
  if (isNaN(d.getTime())) return String(ts).slice(0, 16);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function classify(r: BpmQueueReferral): Tab {
  if (r.ro_matched_at) return "completed";
  if (r.closed_at) return "closed";
  if (r.validated_at) return "followup";
  return "active";
}

function StatusBadge({ r }: { r: BpmQueueReferral }) {
  const tab = classify(r);
  const map: Record<Tab, { label: string; cls: string }> = {
    active: {
      label: r.call_status === "not_connected" ? "Not connected — retry" : "To call",
      cls: "bg-accent-soft text-accent-text",
    },
    followup: { label: "Validated — follow up", cls: "bg-warn-soft text-warn-text" },
    completed: { label: "Completed", cls: "bg-good-soft text-good-text" },
    closed: { label: r.closed_reason === "not_genuine" ? "Not genuine" : "Not interested", cls: "bg-surface-2 text-fg-faint" },
  };
  const { label, cls } = map[tab];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>;
}

const INIT: BpmActionState = { error: null, ok: false };

function NotConnectedButton({ id, onDone }: { id: number; onDone: () => void }) {
  const [state, action, pending] = useActionState(markNotConnectedAction, INIT);
  return (
    <form
      action={async (fd) => {
        await action(fd);
        onDone();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="h-8 rounded-md border border-border-strong px-3 text-sm font-medium text-fg-muted hover:bg-surface-2 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Not connected"}
      </button>
      {state.error ? <p className="mt-1 text-xs text-bad">{state.error}</p> : null}
    </form>
  );
}

function LogFollowUpButton({ id, onDone }: { id: number; onDone: () => void }) {
  const [state, action, pending] = useActionState(logFollowUpContactAction, INIT);
  return (
    <form
      action={async (fd) => {
        await action(fd);
        onDone();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="h-8 rounded-md bg-accent px-3 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? "Saving…" : "Log follow-up — spoke to customer"}
      </button>
      {state.error ? <p className="mt-1 text-xs text-bad">{state.error}</p> : null}
    </form>
  );
}

function CallOutcomeForm({ id, onDone }: { id: number; onDone: () => void }) {
  const [state, action, pending] = useActionState(submitCallOutcomeAction, INIT);
  const [genuine, setGenuine] = useState<"yes" | "no" | "">("");
  const [interested, setInterested] = useState<"yes" | "no" | "">("");

  return (
    <form
      action={async (fd) => {
        await action(fd);
        onDone();
      }}
      className="space-y-3 rounded-lg border border-border-strong bg-surface-2/50 p-3"
    >
      <input type="hidden" name="id" value={id} />

      <div>
        <span className={eyebrow}>Genuine case?</span>
        <div className="mt-1 flex gap-2">
          {(["yes", "no"] as const).map((v) => (
            <label key={v} className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm ${genuine === v ? "border-accent bg-accent-soft text-accent-text" : "border-border-strong text-fg-muted"}`}>
              <input type="radio" name="genuine" value={v} checked={genuine === v} onChange={() => setGenuine(v)} className="sr-only" />
              {v === "yes" ? "Yes" : "No"}
            </label>
          ))}
        </div>
      </div>

      {genuine === "yes" ? (
        <>
          <div>
            <span className={eyebrow}>Estimate amount (₹)</span>
            <input name="estimateAmount" type="number" min="0" step="1" required className={`${control} mt-1 w-full px-2`} />
          </div>

          <div>
            <span className={eyebrow}>Customer interested?</span>
            <div className="mt-1 flex gap-2">
              {(["yes", "no"] as const).map((v) => (
                <label key={v} className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm ${interested === v ? "border-accent bg-accent-soft text-accent-text" : "border-border-strong text-fg-muted"}`}>
                  <input
                    type="radio"
                    name="customerInterested"
                    value={v}
                    checked={interested === v}
                    onChange={() => setInterested(v)}
                    className="sr-only"
                  />
                  {v === "yes" ? "Yes" : "No"}
                </label>
              ))}
            </div>
          </div>

          {interested === "yes" ? (
            <div>
              <span className={eyebrow}>Payment type</span>
              <div className="mt-1 flex gap-2">
                <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-sm text-fg-muted has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent-text">
                  <input type="radio" name="paymentType" value="CP" required className="h-3.5 w-3.5" />
                  Customer paid (CP)
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-sm text-fg-muted has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent-text">
                  <input type="radio" name="paymentType" value="IP" required className="h-3.5 w-3.5" />
                  Insurance paid (IP)
                </label>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {genuine ? (
        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={pending}
            className="h-8 rounded-md bg-accent px-3 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save call outcome"}
          </button>
          {state.error ? <span className="text-xs text-bad">{state.error}</span> : null}
        </div>
      ) : null}
    </form>
  );
}

function TransferControl({ id, ownBranch, branchCodes, onDone }: { id: number; ownBranch: string; branchCodes: string[]; onDone: () => void }) {
  const [state, action, pending] = useActionState(transferReferralAction, INIT);
  const [open, setOpen] = useState(false);
  const options = branchCodes.filter((b) => b !== ownBranch);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-accent-text hover:underline">
        Transfer to another branch
      </button>
    );
  }

  return (
    <form
      action={async (fd) => {
        await action(fd);
        onDone();
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="id" value={id} />
      <select name="toBranch" required className={`${control} px-2`}>
        <option value="">Choose branch…</option>
        {options.map((b) => (
          <option key={b} value={b}>
            {branchName(b)} ({b})
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="h-8 rounded-md bg-accent px-3 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60">
        {pending ? "Transferring…" : "Confirm transfer"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-fg-muted hover:underline">
        Cancel
      </button>
      {state.error ? <span className="w-full text-xs text-bad">{state.error}</span> : null}
    </form>
  );
}

function DetailModal({
  referral,
  ownBranch,
  branchCodes,
  readOnly,
  onClose,
}: {
  referral: BpmQueueReferral;
  ownBranch: string;
  branchCodes: string[];
  readOnly: boolean;
  onClose: () => void;
}) {
  const r = referral;
  const tab = classify(r);
  const canAct = !readOnly && r.assigned_branch === ownBranch;
  const canTransfer = canAct && !r.closed_at && !r.ro_matched_at;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-fg">{r.referring_employee_name ?? "—"}</h2>
            <p className="text-xs text-fg-faint">
              ID: {r.referring_employee_id ?? "—"} · {r.referring_employee_branch || "—"}
              {r.transferred_from ? ` · Transferred from ${branchName(r.transferred_from)}` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-fg-faint hover:bg-surface-2">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
              <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="mt-3">
          <StatusBadge r={r} />
        </div>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-fg-faint">Customer phone</dt>
            <dd className="font-semibold text-fg">{r.customer_phone ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-fg-faint">Vehicle reg</dt>
            <dd className="font-mono text-fg">{r.vehicle_reg_no ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-fg-faint">Submitted</dt>
            <dd className="text-fg-muted">{fmt(r.submitted_at)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-fg-faint">Location</dt>
            <dd className="text-right text-fg-muted">{r.location || "—"}</dd>
          </div>
          <div>
            <dt className="text-fg-faint">Description</dt>
            <dd className="mt-0.5 text-fg-muted">{r.description || "—"}</dd>
          </div>
        </dl>

        {r.vehicle_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/bp-referrals/photo/${r.id}`}
            alt="Vehicle"
            className="mt-3 max-h-56 w-full rounded-md border border-border object-contain"
          />
        ) : null}

        {tab !== "active" ? (
          <div className="mt-4 space-y-1.5 border-t border-border-subtle pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-fg-faint">Genuine</span>
              <span className="text-fg">{r.genuine === null ? "—" : r.genuine ? "Yes" : "No"}</span>
            </div>
            {r.estimate_amount != null ? (
              <div className="flex justify-between">
                <span className="text-fg-faint">Estimate</span>
                <span className="text-fg">₹{Number(r.estimate_amount).toLocaleString("en-IN")}</span>
              </div>
            ) : null}
            {r.customer_interested !== null ? (
              <div className="flex justify-between">
                <span className="text-fg-faint">Interested</span>
                <span className="text-fg">{r.customer_interested ? "Yes" : "No"}</span>
              </div>
            ) : null}
            {r.payment_type ? (
              <div className="flex justify-between">
                <span className="text-fg-faint">Payment type</span>
                <span className="text-fg">{r.payment_type === "CP" ? "Customer paid" : "Insurance paid"}</span>
              </div>
            ) : null}
            {r.handled_by ? (
              <div className="flex justify-between">
                <span className="text-fg-faint">Handled by</span>
                <span className="text-fg">{r.handled_by}</span>
              </div>
            ) : null}
            {r.matched_ro_no ? (
              <div className="flex justify-between">
                <span className="text-fg-faint">Matched RO</span>
                <span className="font-mono text-fg">{r.matched_ro_no}</span>
              </div>
            ) : null}
            {tab === "followup" ? (
              <div className="flex justify-between">
                <span className="text-fg-faint">Last contacted</span>
                <span className="text-fg">{fmt(r.last_contacted_at)}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {canAct && tab === "active" ? (
          <div className="mt-4 space-y-3 border-t border-border-subtle pt-3">
            <NotConnectedButton id={r.id} onDone={onClose} />
            <CallOutcomeForm id={r.id} onDone={onClose} />
          </div>
        ) : null}

        {canAct && tab === "followup" ? (
          <div className="mt-4 border-t border-border-subtle pt-3">
            <LogFollowUpButton id={r.id} onDone={onClose} />
          </div>
        ) : null}

        {canTransfer ? (
          <div className="mt-4 border-t border-border-subtle pt-3">
            <TransferControl id={r.id} ownBranch={ownBranch} branchCodes={branchCodes} onDone={onClose} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

const TAB_LABEL: Record<Tab, string> = { active: "To call", followup: "Follow-up", completed: "Completed", closed: "Closed" };

function QueueList({
  referrals,
  ownBranch,
  branchCodes,
  readOnly,
  showBranchColumn,
}: {
  referrals: BpmQueueReferral[];
  ownBranch: string;
  branchCodes: string[];
  readOnly: boolean;
  showBranchColumn: boolean;
}) {
  const [tab, setTab] = useState<Tab>("active");
  const [selected, setSelected] = useState<BpmQueueReferral | null>(null);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { active: 0, followup: 0, completed: 0, closed: 0 };
    for (const r of referrals) c[classify(r)]++;
    return c;
  }, [referrals]);

  const filtered = referrals.filter((r) => classify(r) === tab);

  return (
    <>
      {selected ? (
        <DetailModal referral={selected} ownBranch={ownBranch} branchCodes={branchCodes} readOnly={readOnly} onClose={() => setSelected(null)} />
      ) : null}

      <div className="mb-3 flex gap-1.5">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === t ? "bg-accent-soft text-accent-text" : "text-fg-muted hover:bg-surface-2"}`}
          >
            {TAB_LABEL[t]} ({counts[t]})
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Submitted</th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Employee</th>
              {showBranchColumn ? <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Branch</th> : null}
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Reg No</th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={showBranchColumn ? 5 : 4} className="px-3 py-8 text-center text-sm text-fg-muted">
                  Nothing here.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-surface-2/50" onClick={() => setSelected(r)}>
                  <td className="whitespace-nowrap px-3 py-2.5 text-fg-muted">{fmt(r.submitted_at)}</td>
                  <td className="px-3 py-2.5 font-medium text-fg">
                    {r.referring_employee_name ?? "—"}
                    {r.transferred_from ? <span className="ml-1.5 text-xs text-fg-faint">(from {branchName(r.transferred_from)})</span> : null}
                  </td>
                  {showBranchColumn ? <td className="whitespace-nowrap px-3 py-2.5 text-fg-muted">{branchName(r.assigned_branch ?? "")}</td> : null}
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-fg">{r.vehicle_reg_no ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <StatusBadge r={r} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function BpmQueueClient({
  ownBranch,
  queue,
  branchCodes,
  regionName,
  regionRollup,
}: {
  ownBranch: string;
  queue: BpmQueueReferral[];
  branchCodes: string[];
  regionName: string | null;
  regionRollup: BpmQueueReferral[] | null;
}) {
  const [view, setView] = useState<"own" | "region">("own");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fg">BP Referrals — {branchName(ownBranch)}</h1>
          <p className="mt-1 text-sm text-fg-muted">{queue.length} total referral{queue.length === 1 ? "" : "s"} assigned to your branch.</p>
        </div>
        {regionName && regionRollup ? (
          <div className="flex gap-1.5 rounded-md border border-border p-1">
            <button
              type="button"
              onClick={() => setView("own")}
              className={`rounded px-2.5 py-1 text-xs font-medium ${view === "own" ? "bg-accent-soft text-accent-text" : "text-fg-muted"}`}
            >
              My branch
            </button>
            <button
              type="button"
              onClick={() => setView("region")}
              className={`rounded px-2.5 py-1 text-xs font-medium ${view === "region" ? "bg-accent-soft text-accent-text" : "text-fg-muted"}`}
            >
              {regionName} region
            </button>
          </div>
        ) : null}
      </div>

      {view === "own" ? (
        <QueueList referrals={queue} ownBranch={ownBranch} branchCodes={branchCodes} readOnly={false} showBranchColumn={false} />
      ) : (
        <QueueList referrals={regionRollup ?? []} ownBranch={ownBranch} branchCodes={branchCodes} readOnly={true} showBranchColumn={true} />
      )}
    </div>
  );
}
