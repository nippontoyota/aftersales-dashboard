import type { AdminAccount } from "../admin-store";
import { pool } from "../db";
import { REGIONS } from "../regions";
import { loadCrossMonthReplacements, NEW_RULE_CUTOVER_DATE } from "./cross-month-replacement";

/**
 * The "Got it" popup (adjustment-ack-popup-gate.tsx) interrupts a branch or
 * regional admin with every cross-month adjustment touching their own
 * branch(es) that they haven't explicitly acknowledged yet — so a branch
 * finds out a cancellation of theirs got cross-month-adjusted instead of
 * only ever seeing it if they happen to open /cancellations. HQ isn't
 * included (per the user's call) — they can already see everything on
 * /cancellations itself.
 *
 * "Pending" is computed fresh against cross_month_replacements every time
 * (not cached) — this table is small (tens of rows, not millions), so there's
 * no precompute-at-upload-time need like reconcile.ts's much larger joins.
 */
export type PendingAdjustmentAck = {
  branch: string;
  cancelledDocNo: string;
  refDocNo: string;
  replacementDocNo: string;
  replacementMonth: string;
  partSale: number;
  labourSale: number;
  originalPartSale: number | null;
  originalLabourSale: number | null;
  usingOriginalValue: boolean;
};

function scopeBranches(admin: AdminAccount): string[] | null {
  if (admin.role === "branch") return [admin.branch];
  if (admin.role === "regional") return [...REGIONS[admin.region]];
  return null; // HQ/VP/CEO/Accounts/hq_viewer — not shown this popup at all
}

export async function loadPendingAdjustmentAcks(admin: AdminAccount): Promise<PendingAdjustmentAck[]> {
  const branches = scopeBranches(admin);
  if (!branches) return [];

  const all = await loadCrossMonthReplacements();
  const scoped = all.filter((r) => branches.includes(r.branch));
  if (scoped.length === 0) return [];

  const { rows: ackRows } = await pool.query<{ branch: string; cancelled_doc_no: string; replacement_doc_no: string }>(
    `select branch, cancelled_doc_no, replacement_doc_no from cancellation_adjustment_acks where username = $1`,
    [admin.username]
  );
  const acked = new Set(ackRows.map((r) => `${r.branch}|${r.cancelled_doc_no}|${r.replacement_doc_no}`));

  return scoped
    .filter((r) => !acked.has(`${r.branch}|${r.cancelledDocNo}|${r.replacementDocNo}`))
    .map((r) => ({
      branch: r.branch,
      cancelledDocNo: r.cancelledDocNo,
      refDocNo: r.refDocNo,
      replacementDocNo: r.replacementDocNo,
      replacementMonth: r.replacementMonth,
      partSale: r.partSale,
      labourSale: r.labourSale,
      originalPartSale: r.originalPartSale,
      originalLabourSale: r.originalLabourSale,
      usingOriginalValue: r.originalPartSale !== null && r.originalLabourSale !== null && r.replacementDate >= NEW_RULE_CUTOVER_DATE,
    }));
}

/** Acks every adjustment currently pending for this admin — recomputed
 * server-side rather than trusting a client-submitted list, so "Got it"
 * can't be used to silently ack something the admin was never actually
 * shown. Returns how many were newly acked. */
export async function acknowledgeAllPendingAdjustments(admin: AdminAccount): Promise<number> {
  const pending = await loadPendingAdjustmentAcks(admin);
  if (pending.length === 0) return 0;

  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const p of pending) {
      await client.query(
        `insert into cancellation_adjustment_acks (branch, cancelled_doc_no, replacement_doc_no, username)
         values ($1, $2, $3, $4)
         on conflict (branch, cancelled_doc_no, replacement_doc_no, username) do nothing`,
        [p.branch, p.cancelledDocNo, p.replacementDocNo, admin.username]
      );
    }
    await client.query("commit");
    return pending.length;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
