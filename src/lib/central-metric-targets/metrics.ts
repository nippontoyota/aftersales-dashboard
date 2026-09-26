/** The 7 metrics themselves — split out from view-data.ts (which pulls in
 * `pool`/pg for its DB queries) so a client component can list the metrics
 * without also bundling the Postgres client into the browser. */
export type CentralMetricKey = "bpu" | "offtake" | "sprInternal" | "sprExternal" | "pmOc" | "battery" | "tyre";

export const CENTRAL_METRICS: { key: CentralMetricKey; label: string; isCurrency: boolean }[] = [
  { key: "bpu", label: "BPU", isCurrency: false },
  { key: "offtake", label: "Offtake (SPO Dealer)", isCurrency: true },
  { key: "sprInternal", label: "SPR Internal (Parts Retail)", isCurrency: true },
  { key: "sprExternal", label: "SPR External", isCurrency: true },
  { key: "pmOc", label: "PM+OC", isCurrency: false },
  { key: "battery", label: "Battery", isCurrency: false },
  { key: "tyre", label: "Tyre", isCurrency: false },
];
