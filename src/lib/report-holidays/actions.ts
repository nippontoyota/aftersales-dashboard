"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "../auth";
import { addReportHoliday, removeReportHoliday } from "./store";

async function requireHqAdmin(): Promise<{ username: string }> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== "hq") throw new Error("HQ admin required.");
  return { username: admin.username };
}

export async function addReportHolidayAction(formData: FormData): Promise<void> {
  const { username } = await requireHqAdmin();
  const date = String(formData.get("date") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  await addReportHoliday(date, note, username);
  revalidatePath("/data");
  revalidatePath("/upload");
  revalidatePath("/upload-sheet");
}

export async function removeReportHolidayAction(formData: FormData): Promise<void> {
  await requireHqAdmin();
  const date = String(formData.get("date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  await removeReportHoliday(date);
  revalidatePath("/data");
  revalidatePath("/upload");
  revalidatePath("/upload-sheet");
}
