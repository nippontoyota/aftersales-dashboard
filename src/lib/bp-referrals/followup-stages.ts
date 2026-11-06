/** The two stages a BPM picks when logging a follow-up (2026-11-06,
 * narrowed from a longer list at the user's request — everything else
 * belongs in the free-text remark, not a dropdown). Client-safe (no pg
 * import) so both the queue page and the follow-up popup can share it.
 *
 * "vehicle_received" is the one with a side effect: for an insurance-paid
 * (IP) referral it also requires the BP Estimate Invoice number and moves
 * the referral into its own "Vehicle received" section (see
 * logFollowUpContact in store.ts and classify() in the two client
 * components). For a customer-paid (CP) referral it's just a logged note —
 * CP has no estimate-invoice paperwork step, so it stays in Follow-up until
 * an RO is entered. "Repair in progress" is deliberately NOT an option here
 * — that transition is automatic (RO entered), not a manual pick. */
export const FOLLOW_UP_STAGES = [
  { value: "vehicle_received", label: "Vehicle received" },
  { value: "customer_following_up", label: "Customer following up" },
] as const;

export type FollowUpStage = (typeof FOLLOW_UP_STAGES)[number]["value"];

export function followUpStageLabel(value: string): string | null {
  return FOLLOW_UP_STAGES.find((s) => s.value === value)?.label ?? null;
}
