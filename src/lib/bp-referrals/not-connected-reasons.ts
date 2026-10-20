/** The five common "not connected" outcomes a BPM runs into, plus a free-text
 * escape hatch — 2026-10-20, the user's call, so the common cases are
 * countable without parsing free text. Client-safe (no pg import) so both
 * the queue page and the urgent-contact popup can share it. */
export const NOT_CONNECTED_REASONS = [
  { value: "rnr", label: "RNR (ringing, no response)" },
  { value: "switched_off", label: "Switched off" },
  { value: "invalid_number", label: "Invalid/wrong number" },
  { value: "busy", label: "Busy" },
  { value: "not_reachable", label: "Not reachable (out of coverage/network issue)" },
  { value: "other", label: "Other" },
] as const;

export type NotConnectedReason = (typeof NOT_CONNECTED_REASONS)[number]["value"];

export function notConnectedReasonLabel(value: string): string | null {
  return NOT_CONNECTED_REASONS.find((r) => r.value === value)?.label ?? null;
}
