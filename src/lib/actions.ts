"use server";

import { redirect } from "next/navigation";
import { checkCredentials, createSession, destroySession } from "./auth";

export type LoginState = { error: string | null };

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: "Username and password are required." };
  }
  const admin = await checkCredentials(username, password);
  if (!admin) {
    return { error: "Invalid username or password." };
  }

  await createSession(admin.username);
  redirect("/upload");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
