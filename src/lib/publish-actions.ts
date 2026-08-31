"use server";

import { revalidatePath } from "next/cache";
import { publishDate } from "./publish-store";
import { getCurrentAdmin } from "./auth";

export async function publishDashboardAction(formData: FormData): Promise<void> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== "hq") {
    throw new Error("HQ admin required.");
  }
  const date = String(formData.get("date") ?? "").trim();
  const redirectTo = String(formData.get("redirectTo") ?? "/dashboard");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

  await publishDate(date, admin.username);

  // Every page that reads publish status needs to see the fresh state.
  revalidatePath("/dashboard");
  revalidatePath("/alerts");
  revalidatePath("/branches");
  revalidatePath("/reports");
  revalidatePath("/tkm-targets");
  revalidatePath(redirectTo);
}
