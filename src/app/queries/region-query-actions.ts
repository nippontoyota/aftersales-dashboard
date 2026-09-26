"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/auth";
import { REGIONS, regionForBranch, type RegionName } from "@/lib/regions";
import {
  createRegionQuery,
  listRegionQueriesForBranch,
  listRegionQueriesForRegion,
  replyToRegionQuery,
  setRegionQueryStatus,
  type RegionQuery,
} from "@/lib/region-queries/store";

export type RegionQueryState = { error: string | null; ok: boolean };

const REGION_NAMES = new Set<RegionName>(["North", "Central", "South"]);

function optionalField(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "").trim();
  return v === "" ? null : v;
}

/** A regional manager raises a question to HQ. */
export async function raiseRegionQueryAction(_prev: RegionQueryState, formData: FormData): Promise<RegionQueryState> {
  const admin = await getCurrentAdmin();
  if (admin?.role !== "regional") return { error: "Not allowed.", ok: false };

  const note = String(formData.get("note") ?? "").trim();
  if (!note) return { error: "Type your question first.", ok: false };

  const branch = optionalField(formData, "branch");
  if (branch && !(REGIONS[admin.region] as readonly string[]).includes(branch)) {
    return { error: "That branch isn't in your region.", ok: false };
  }

  await createRegionQuery({
    createdBy: admin.username,
    direction: "to_hq",
    region: admin.region,
    contextDate: optionalField(formData, "date"),
    contextBranch: branch,
    note,
  });

  revalidatePath("/queries");
  return { error: null, ok: true };
}

/** HQ raises a question to a chosen regional manager. */
export async function raiseRegionQueryToRegionAction(_prev: RegionQueryState, formData: FormData): Promise<RegionQueryState> {
  const admin = await getCurrentAdmin();
  if (admin?.role !== "hq") return { error: "Not allowed.", ok: false };

  const regionRaw = String(formData.get("region") ?? "");
  if (!REGION_NAMES.has(regionRaw as RegionName)) return { error: "Pick a region.", ok: false };
  const region = regionRaw as RegionName;

  const note = String(formData.get("note") ?? "").trim();
  if (!note) return { error: "Type your question first.", ok: false };

  const branch = optionalField(formData, "branch");
  if (branch && !(REGIONS[region] as readonly string[]).includes(branch)) {
    return { error: "That branch isn't in the chosen region.", ok: false };
  }

  await createRegionQuery({
    createdBy: admin.username,
    direction: "to_region",
    region,
    contextDate: optionalField(formData, "date"),
    contextBranch: branch,
    note,
  });

  revalidatePath("/queries");
  return { error: null, ok: true };
}

/** HQ or a regional manager raises a question to one specific branch
 * (2026-09-26) — private to that branch, never shown to the regional
 * manager (see region-queries/store.ts). A regional manager is locked to
 * their own branches; HQ picks any branch in any region. */
export async function raiseRegionQueryToBranchAction(_prev: RegionQueryState, formData: FormData): Promise<RegionQueryState> {
  const admin = await getCurrentAdmin();
  if (admin?.role !== "hq" && admin?.role !== "regional") return { error: "Not allowed.", ok: false };

  const branch = String(formData.get("branch") ?? "").trim();
  if (!branch) return { error: "Pick a branch.", ok: false };

  const region = regionForBranch(branch);
  if (!region) return { error: "Unknown branch.", ok: false };
  if (admin.role === "regional" && admin.region !== region) return { error: "That branch isn't in your region.", ok: false };

  const note = String(formData.get("note") ?? "").trim();
  if (!note) return { error: "Type your question first.", ok: false };

  await createRegionQuery({
    createdBy: admin.username,
    direction: "to_branch",
    region,
    contextDate: optionalField(formData, "date"),
    contextBranch: branch,
    note,
  });

  revalidatePath("/queries");
  return { error: null, ok: true };
}

/** Whoever the thread is addressed to replying — HQ answering "to_hq",
 * a regional manager answering "to_region", or a branch admin answering
 * "to_branch". The store doesn't care which; the caller only ever sees the
 * reply form on threads addressed to them. */
export async function replyRegionQueryAction(_prev: RegionQueryState, formData: FormData): Promise<RegionQueryState> {
  const admin = await getCurrentAdmin();
  if (admin?.role !== "hq" && admin?.role !== "regional" && admin?.role !== "branch") return { error: "Not allowed.", ok: false };

  const id = Number(formData.get("id"));
  const reply = String(formData.get("reply") ?? "").trim();
  const close = formData.get("close") === "on";
  if (!Number.isFinite(id) || id <= 0) return { error: "Bad query id.", ok: false };
  if (!reply) return { error: "Type a reply first.", ok: false };

  await replyToRegionQuery({ id, repliedBy: admin.username, reply, status: close ? "closed" : "answered" });
  revalidatePath("/queries");
  return { error: null, ok: true };
}

/** The original asker (or a branch admin managing their own to_branch
 * thread) closes/reopens it. */
export async function setRegionQueryStatusAction(_prev: RegionQueryState, formData: FormData): Promise<RegionQueryState> {
  const admin = await getCurrentAdmin();
  if (admin?.role !== "hq" && admin?.role !== "regional" && admin?.role !== "branch") return { error: "Not allowed.", ok: false };

  const id = Number(formData.get("id"));
  const status = String(formData.get("status") ?? "");
  if (!Number.isFinite(id) || id <= 0) return { error: "Bad query id.", ok: false };
  if (status !== "open" && status !== "closed") return { error: "Bad status.", ok: false };

  await setRegionQueryStatus(id, status);
  revalidatePath("/queries");
  return { error: null, ok: true };
}

/** The login pop-up's data source (2026-09-26) — every query still awaiting
 * this viewer's own action, right now: a branch's own open to_branch
 * threads, or a regional manager's open to_region / answered-awaiting-close
 * to_hq threads (the exact same conditions as countActionableForRegion/
 * countActionableForBranch, just returning the rows instead of a count).
 * Empty for every other role — HQ isn't nagged by this pop-up, they already
 * live on this page. */
export async function getMyOpenQueriesForPopupAction(): Promise<RegionQuery[]> {
  const admin = await getCurrentAdmin();
  if (!admin) return [];

  if (admin.role === "branch") {
    const rows = await listRegionQueriesForBranch(admin.branch);
    return rows.filter((q) => q.status === "open");
  }
  if (admin.role === "regional") {
    const rows = await listRegionQueriesForRegion(admin.region);
    return rows.filter((q) => (q.direction === "to_region" && q.status === "open") || (q.direction === "to_hq" && q.status === "answered"));
  }
  return [];
}
