"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/auth";
import { createVpFlag, replyToVpFlag, setVpFlagStatus, type VpFlagPage } from "@/lib/vp-flags/store";

const PAGES = new Set<VpFlagPage>(["overview", "region", "branch"]);

export type FlagState = { error: string | null; ok: boolean };

/** VP raises a query. Context comes from hidden fields the page fills in
 * (which cell / date / branch was in view); only the note is typed. */
export async function raiseVpFlagAction(_prev: FlagState, formData: FormData): Promise<FlagState> {
  const admin = await getCurrentAdmin();
  if (admin?.role !== "vp_service") return { error: "Not allowed.", ok: false };

  const note = String(formData.get("note") ?? "").trim();
  if (!note) return { error: "Type your question first.", ok: false };

  const pageRaw = String(formData.get("page") ?? "overview");
  const page: VpFlagPage = PAGES.has(pageRaw as VpFlagPage) ? (pageRaw as VpFlagPage) : "overview";
  const opt = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v === "" ? null : v;
  };

  await createVpFlag({
    createdBy: admin.username,
    page,
    date: opt("date"),
    region: opt("region"),
    branch: opt("branch"),
    metric: opt("metric"),
    value: opt("value"),
    note,
  });

  revalidatePath("/vp/queries");
  revalidatePath("/alerts");
  return { error: null, ok: true };
}

/** HQ answers a query. */
export async function replyVpFlagAction(_prev: FlagState, formData: FormData): Promise<FlagState> {
  const admin = await getCurrentAdmin();
  if (admin?.role !== "hq") return { error: "Only HQ can reply.", ok: false };

  const id = Number(formData.get("id"));
  const reply = String(formData.get("reply") ?? "").trim();
  const close = formData.get("close") === "on";
  if (!Number.isFinite(id) || id <= 0) return { error: "Bad flag id.", ok: false };
  if (!reply) return { error: "Type a reply first.", ok: false };

  await replyToVpFlag({ id, repliedBy: admin.username, reply, status: close ? "closed" : "answered" });
  revalidatePath("/vp/queries");
  revalidatePath("/alerts");
  return { error: null, ok: true };
}

/** VP closes (or reopens) their own thread. */
export async function setVpFlagStatusAction(_prev: FlagState, formData: FormData): Promise<FlagState> {
  const admin = await getCurrentAdmin();
  if (admin?.role !== "vp_service" && admin?.role !== "hq") return { error: "Not allowed.", ok: false };

  const id = Number(formData.get("id"));
  const status = String(formData.get("status") ?? "");
  if (!Number.isFinite(id) || id <= 0) return { error: "Bad flag id.", ok: false };
  if (status !== "open" && status !== "closed") return { error: "Bad status.", ok: false };

  await setVpFlagStatus(id, status);
  revalidatePath("/vp/queries");
  revalidatePath("/alerts");
  return { error: null, ok: true };
}
