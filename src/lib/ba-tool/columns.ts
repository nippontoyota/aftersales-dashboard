/**
 * Maps the BA Tool workbook's exact column headers to internal keys. Header
 * matching is done after trimming/collapsing whitespace — the source file
 * has inconsistent trailing/double spaces (e.g. "PM ", "Lab Rev GS  [Non
 * VAS]") that would otherwise cause silent mismatches.
 */
export const BA_TOOL_COLUMNS = {
  branch: "Dealer Branch",
  pm: "PM",
  pmTarget: "PM Target",
  bpus: "BPUS",
  bpusTarget: "BPUS Target",
  sprInternal: "SPR Internal",
  sprInternalTarget: "SPR Internal Target",
  sprExternal: "SPR External",
  spoDealer: "SPO Dealer",
  spoDealerTarget: "SPO Dealer Target",
  spoTGloss: "SPO T-Gloss",
  spoTGlossTarget: "SPO T-Gloss Target",
  cpus: "CPUS",
  gus: "GUS",
  tyreActual: "Tyre Actual",
  tyreTarget: "Tyre Target",
  batteryActuals: "Battery Actuals",
  batteryTarget: "Battery Target",
  servicePenetration: "Service Penetration",
} as const;

export type BaToolKey = keyof typeof BA_TOOL_COLUMNS;

export function normalizeHeader(header: string): string {
  return String(header ?? "").replace(/\s+/g, " ").trim();
}
