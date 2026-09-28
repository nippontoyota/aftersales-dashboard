"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/auth";
import { REGIONS, type RegionName } from "@/lib/regions";
import {
  createVpQuery,
  getVpQueryRecipient,
  replyToVpQueryRecipient,
  setVpQueryThreadArchived,
  type VpQueryPage,
  type VpQueryRecipientInput,
} from "@/lib/vp-flags/store";

const PAGES = new Set<VpQueryPage>(["overview", "region", "branch"]);
const REGION_NAMES = new Set<RegionName>(Object.keys(REGIONS) as RegionName[]);
const BRANCHES = new Set<string>(Object.values(REGIONS).flat());

export type FlagState = { error: string | null; ok: boolean };

function revalidateEverywhere() {
  revalidatePath("/vp");
  revalidatePath("/vp/branches");
  revalidatePath("/queries");
}

/** Parses the composer's `recipients` checkboxes — values like "hq",
 * "regional:Central", "branch:CO01A" — into typed recipient inputs,
 * dropping anything malformed rather than erroring the whole submission. */
function parseRecipients(formData: FormData): VpQueryRecipientInput[] {
  const values = formData.getAll("recipients").map(String);
  const out: VpQueryRecipientInput[] = [];
  for (const v of values) {
    if (v === "hq") {
      out.push({ type: "hq" });
    } else if (v.startsWith("regional:")) {
      const region = v.slice("regional:".length);
      if (REGION_NAMES.has(region as RegionName)) out.push({ type: "regional", region: region as RegionName });
    } else if (v.startsWith("branch:")) {
      const branch = v.slice("branch:".length);
      if (BRANCHES.has(branch)) out.push({ type: "branch", branch });
    }
  }
  return out;
}

/** VP raises a query. Context comes from hidden fields the page fills in
 * (which cell / date / branch was in view); the note and recipient
 * checkboxes are the only fields the VP fills in themselves. */
export async function raiseVpFlagAction(_prev: FlagState, formData: FormData): Promise<FlagState> {
  const admin = await getCurrentAdmin();
  if (admin?.role !== "vp_service") return { error: "Not allowed.", ok: false };

  const note = String(formData.get("note") ?? "").trim();
  if (!note) return { error: "Type your question first.", ok: false };

  const recipients = parseRecipients(formData);
  if (recipients.length === 0) return { error: "Pick at least one recipient.", ok: false };

  const pageRaw = String(formData.get("page") ?? "overview");
  const page: VpQueryPage = PAGES.has(pageRaw as VpQueryPage) ? (pageRaw as VpQueryPage) : "overview";
  const opt = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v === "" ? null : v;
  };

  await createVpQuery({
    createdBy: admin.username,
    page,
    date: opt("date"),
    region: opt("region"),
    branch: opt("branch"),
    metric: opt("metric"),
    value: opt("value"),
    note,
    recipients,
  });

  revalidateEverywhere();
  return { error: null, ok: true };
}

/** HQ / a regional manager / a branch admin answers a query addressed to
 * them. Ownership is re-checked server-side against the recipient row
 * itself — a submitted recipient id only ever gets replied to by the admin
 * it's actually addressed to. */
export async function replyVpFlagAction(_prev: FlagState, formData: FormData): Promise<FlagState> {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not allowed.", ok: false };

  const id = Number(formData.get("id"));
  const reply = String(formData.get("reply") ?? "").trim();
  if (!Number.isFinite(id) || id <= 0) return { error: "Bad query id.", ok: false };
  if (!reply) return { error: "Type a reply first.", ok: false };

  const recipient = await getVpQueryRecipient(id);
  if (!recipient) return { error: "Query not found.", ok: false };

  const allowed =
    (recipient.type === "hq" && (admin.role === "hq" || admin.role === "hq_viewer")) ||
    (recipient.type === "regional" && admin.role === "regional" && admin.region === recipient.region) ||
    (recipient.type === "branch" && admin.role === "branch" && admin.branch === recipient.branch);
  if (!allowed) return { error: "This query isn't addressed to you.", ok: false };

  await replyToVpQueryRecipient({ id, repliedBy: admin.username, reply });
  revalidateEverywhere();
  return { error: null, ok: true };
}

/** VP archives (or reopens) their own thread. */
export async function setVpFlagStatusAction(_prev: FlagState, formData: FormData): Promise<FlagState> {
  const admin = await getCurrentAdmin();
  if (admin?.role !== "vp_service") return { error: "Not allowed.", ok: false };

  const id = Number(formData.get("id"));
  const status = String(formData.get("status") ?? "");
  if (!Number.isFinite(id) || id <= 0) return { error: "Bad query id.", ok: false };
  if (status !== "open" && status !== "closed") return { error: "Bad status.", ok: false };

  await setVpQueryThreadArchived(id, status === "closed");
  revalidateEverywhere();
  return { error: null, ok: true };
}
