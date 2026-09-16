"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/auth";
import { REGIONS, type RegionName } from "@/lib/regions";
import { createRegionQuery, replyToRegionQuery, setRegionQueryStatus } from "@/lib/region-queries/store";

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

/** Either side replying — HQ answering a "to_hq" thread, or a regional
 * manager answering a "to_region" one. The store doesn't care which; the
 * caller only ever sees the reply form on threads addressed to them. */
export async function replyRegionQueryAction(_prev: RegionQueryState, formData: FormData): Promise<RegionQueryState> {
  const admin = await getCurrentAdmin();
  if (admin?.role !== "hq" && admin?.role !== "regional") return { error: "Not allowed.", ok: false };

  const id = Number(formData.get("id"));
  const reply = String(formData.get("reply") ?? "").trim();
  const close = formData.get("close") === "on";
  if (!Number.isFinite(id) || id <= 0) return { error: "Bad query id.", ok: false };
  if (!reply) return { error: "Type a reply first.", ok: false };

  await replyToRegionQuery({ id, repliedBy: admin.username, reply, status: close ? "closed" : "answered" });
  revalidatePath("/queries");
  return { error: null, ok: true };
}

/** The original asker closes (or reopens) their own thread. */
export async function setRegionQueryStatusAction(_prev: RegionQueryState, formData: FormData): Promise<RegionQueryState> {
  const admin = await getCurrentAdmin();
  if (admin?.role !== "hq" && admin?.role !== "regional") return { error: "Not allowed.", ok: false };

  const id = Number(formData.get("id"));
  const status = String(formData.get("status") ?? "");
  if (!Number.isFinite(id) || id <= 0) return { error: "Bad query id.", ok: false };
  if (status !== "open" && status !== "closed") return { error: "Bad status.", ok: false };

  await setRegionQueryStatus(id, status);
  revalidatePath("/queries");
  return { error: null, ok: true };
}
