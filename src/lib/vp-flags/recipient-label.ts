import type { RegionName } from "../regions";

/**
 * Split out of store.ts (2026-09-26) — store.ts imports `../db` (pg), which
 * pulls in Node built-ins (`net`, `tls`, `dns`, `fs`) that don't exist in the
 * browser. `vp-flag-thread.tsx` renders inside the client-side queries
 * popup, so anything it imports has to be safe to bundle for the browser —
 * a plain value import of `recipientLabel` from store.ts drags the whole
 * store (and `pg`) into the client bundle even though only this one pure
 * function is used. This file has no server-only dependencies.
 */
export type VpQueryRecipientType = "hq" | "regional" | "branch";

export type RecipientLike = {
  type: VpQueryRecipientType;
  region: RegionName | null;
  branch: string | null;
};

/** Human label for a recipient row — "HQ", "Central Regional Manager", or a branch code. */
export function recipientLabel(r: RecipientLike): string {
  if (r.type === "hq") return "HQ";
  if (r.type === "regional") return `${r.region} Regional Manager`;
  return r.branch ?? "Branch";
}
