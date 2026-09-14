import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";
import type { AdminAccount } from "@/lib/admin-store";

/**
 * The /accounts section is the Accounts (finance) executive view. `accounts`
 * lives here; HQ is also let in — read-only, same convention as
 * vp-guard.ts/ceo-guard.ts. Every other role is sent back to /dashboard.
 */
export async function requireAccountsAccess(): Promise<AdminAccount> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  if (admin.role !== "accounts" && admin.role !== "hq") redirect("/dashboard");
  return admin;
}
