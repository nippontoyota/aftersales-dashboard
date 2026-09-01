"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "./auth";
import { listBranchCodes } from "./admin-store";
import { approveSignupRequest, createSignupRequest, rejectSignupRequest } from "./signup-store";

export type RequestAccountState = { error: string | null; success: boolean };

export async function requestAccountAction(_prevState: RequestAccountState, formData: FormData): Promise<RequestAccountState> {
  const name = String(formData.get("name") ?? "").trim();
  // Usernames are lowercased so login stays exact-match without making
  // people guess their own casing later — every existing account is already
  // lowercase (branch codes, "admin"), this just keeps new ones consistent.
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const branch = String(formData.get("branch") ?? "").trim();

  if (!name || !username || !password || !branch) {
    return { error: "All fields are required.", success: false };
  }
  if (!/^[a-z0-9._-]+$/.test(username)) {
    return { error: "Username can only contain letters, numbers, dots, underscores, and hyphens.", success: false };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters.", success: false };
  }
  const branchCodes = await listBranchCodes();
  if (!branchCodes.includes(branch)) {
    return { error: "Choose a valid branch.", success: false };
  }

  const result = await createSignupRequest({ name, username, password, branch });
  if (!result.ok) {
    return { error: result.error, success: false };
  }
  return { error: null, success: true };
}

export async function approveSignupRequestAction(formData: FormData) {
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== "hq") return;

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  await approveSignupRequest(id, admin.username);
  revalidatePath("/account-requests");
}

export async function rejectSignupRequestAction(formData: FormData) {
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== "hq") return;

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  await rejectSignupRequest(id, admin.username);
  revalidatePath("/account-requests");
}
