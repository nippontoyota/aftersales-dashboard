"use server";

import { getCurrentAdmin } from "@/lib/auth";
import { acknowledgeAllPendingAdjustments, loadPendingAdjustmentAcks, type PendingAdjustmentAck } from "@/lib/cancellation/adjustment-acks";

/** Branch/regional only — see adjustment-acks.ts. Empty for every other role. */
export async function getMyPendingAdjustmentAcksAction(): Promise<PendingAdjustmentAck[]> {
  const admin = await getCurrentAdmin();
  if (!admin) return [];
  return loadPendingAdjustmentAcks(admin);
}

/** Acks whatever is currently pending for this admin (recomputed here, not
 * trusted from the client) and reports how many — the popup closes on a
 * non-zero return. */
export async function acknowledgeMyPendingAdjustmentsAction(): Promise<number> {
  const admin = await getCurrentAdmin();
  if (!admin) return 0;
  return acknowledgeAllPendingAdjustments(admin);
}
