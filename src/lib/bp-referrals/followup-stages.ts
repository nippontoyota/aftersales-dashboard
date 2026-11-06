/** The common progress notes a BPM logs while a referral is open (Follow-up,
 * Vehicle received, or Repair in progress) — same "structured code + free-
 * text escape hatch" shape as not-connected-reasons.ts, so the common cases
 * are countable without parsing free text (2026-11-06, the user's call).
 * Client-safe (no pg import) so both the queue page and the follow-up popup
 * can share it.
 *
 * "vehicle_received" is the one entry with a side effect: for an
 * insurance-paid (IP) referral it also requires the BP Estimate Invoice
 * number and moves the referral into its own "Vehicle received" section
 * (see logFollowUpContact in store.ts and classify() in the two client
 * components). For a customer-paid (CP) referral it's just a logged note —
 * CP has no estimate-invoice paperwork step, so it stays in Follow-up until
 * an RO is entered. "Repair in progress" is deliberately NOT an option here
 * — that transition is automatic (RO entered), not a manual pick. */
export const FOLLOW_UP_STAGES = [
  { value: "vehicle_received", label: "Vehicle received" },
  { value: "survey_done", label: "Insurance survey done" },
  { value: "estimate_approved", label: "Estimate approved" },
  { value: "parts_awaited", label: "Awaiting spare parts" },
  { value: "ready_for_delivery", label: "Ready for delivery" },
  { value: "customer_following_up", label: "Customer following up" },
  { value: "other", label: "Other" },
] as const;

export type FollowUpStage = (typeof FOLLOW_UP_STAGES)[number]["value"];

export function followUpStageLabel(value: string): string | null {
  return FOLLOW_UP_STAGES.find((s) => s.value === value)?.label ?? null;
}
