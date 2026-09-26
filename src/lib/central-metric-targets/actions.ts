"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "../auth";
import { REGIONS } from "../regions";
import { saveCentralMetricTargets } from "./store";

/** Same ownership contract as region-targets/actions.ts's requireRegionalOwner
 * — only wired into the UI for Central today, but not Central-specific in
 * itself. */
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

export async function saveCentralMetricTargetsAction(formData: FormData): Promise<void> {
  const month = String(formData.get("month") ?? "").trim();
  const branch = String(formData.get("branch") ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(month) || !branch) throw new Error("Invalid month or branch.");

  const { username } = await requireRegionalOwner(branch);
  const targets = {
    bpuTarget: parseAmount(formData, "bpuTarget"),
    offtakeTarget: parseAmount(formData, "offtakeTarget"),
    sprInternalTarget: parseAmount(formData, "sprInternalTarget"),
    sprExternalTarget: parseAmount(formData, "sprExternalTarget"),
    pmOcTarget: parseAmount(formData, "pmOcTarget"),
    batteryTarget: parseAmount(formData, "batteryTarget"),
    tyreTarget: parseAmount(formData, "tyreTarget"),
  };

  await saveCentralMetricTargets(month, branch, targets, username);
  revalidatePath("/dashboard");
}
