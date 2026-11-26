"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "../auth";
import { processPendingRecomputes } from "./process";

async function requireHqAdmin(): Promise<void> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== "hq") {
    throw new Error("HQ admin required.");
  }
}

export async function runPendingRecomputesAction(): Promise<void> {
  await requireHqAdmin();
  await processPendingRecomputes();
  revalidatePath("/data");
}
