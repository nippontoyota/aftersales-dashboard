"use server";

import { revalidatePath } from "next/cache";
import { addAccessoriesStaff, removeAccessoriesStaff } from "./accessories-staff-store";
import { getCurrentAdmin } from "./auth";

async function requireHqAdmin(): Promise<void> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== "hq") {
    throw new Error("HQ admin required.");
  }
}

export async function addAccessoriesStaffAction(formData: FormData): Promise<void> {
  await requireHqAdmin();
  const branch = String(formData.get("branch") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!branch || !name) return;
  await addAccessoriesStaff(branch, name);
  revalidatePath("/data");
}

export async function removeAccessoriesStaffAction(formData: FormData): Promise<void> {
  await requireHqAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;
  await removeAccessoriesStaff(id);
  revalidatePath("/data");
}
