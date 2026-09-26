"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "../auth";
import { REGIONS } from "../regions";
import { saveRegionRevenueTargets } from "./store";

/** Any regional manager can set GS/BP/Ext Sales targets for their own
 * region's branches — not HQ-gated like incentive_slab_targets, since these
 * numbers have no source file to upload from; a regional manager just types
 * in what HQ told them. Only wired into the UI for Central today (see
 * central-region-data.ts), but the action itself isn't Central-specific so
 * another region can get the same screen later without touching this file. */
async function requireRegionalOwner(branch: string): Promise<{ username: string }> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== "regional") throw new Error("Regional manager required.");
  const branches: readonly string[] = REGIONS[admin.region];
  if (!branches.includes(branch)) throw new Error("That branch isn't in your region.");
  return { username: admin.username };
}

function parseAmount(formData: FormData, key: string): number {
  const raw = String(formData.get(key) ?? "").trim();
  const n = Number(raw);
  if (raw === "" || !Number.isFinite(n) || n < 0) throw new Error(`${key} must be a non-negative number.`);
  return n;
}

export async function saveRegionRevenueTargetsAction(formData: FormData): Promise<void> {
  const month = String(formData.get("month") ?? "").trim();
  const branch = String(formData.get("branch") ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(month) || !branch) throw new Error("Invalid month or branch.");

  const { username } = await requireRegionalOwner(branch);
  const gsTarget = parseAmount(formData, "gsTarget");
  const bpTarget = parseAmount(formData, "bpTarget");
  const extTarget = parseAmount(formData, "extTarget");

  await saveRegionRevenueTargets(month, branch, { gsTarget, bpTarget, extTarget }, username);
  revalidatePath("/dashboard");
}
