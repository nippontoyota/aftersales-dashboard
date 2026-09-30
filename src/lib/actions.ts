"use server";

import { redirect } from "next/navigation";
import { checkCredentials, createSession, destroySession } from "./auth";
import { checkRateLimits, resetAccountLimit } from "./login-rate-limit";

export type LoginState = { error: string | null };

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: "Username and password are required." };
  }

  // Pre-increment both account and IP counters atomically BEFORE the password
  // check so concurrent requests cannot all pass the threshold simultaneously.
  const blocked = await checkRateLimits(username);
  if (blocked) {
    return { error: "Too many failed attempts. Please try again later." };
  }

  const admin = await checkCredentials(username, password);
  if (!admin) {
    return { error: "Invalid username or password." };
  }

  // Success — reset the account counter so a typo run doesn't lock the user
  // out of their next session. IP counter is preserved intentionally.
  await resetAccountLimit(username);
  await createSession(admin.username);
  // HQ admins land on the Executive Overview (2026-09-24, at the user's
  // request — the upload page isn't what they want to see first). Every
  // other role keeps landing on /upload, unchanged; /dashboard itself
  // already redirects vp_service/ceo/accounts to their own page and anyone
  // without canViewDashboard back to /upload, so this only actually changes
  // behavior for the "hq" role.
  redirect(admin.role === "hq" ? "/dashboard" : "/upload");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
