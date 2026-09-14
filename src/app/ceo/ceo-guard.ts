import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";
import type { AdminAccount } from "@/lib/admin-store";

/**
 * The /ceo section is the CEO executive view. `ceo` lives here; HQ is also
 * let in — read-only, same convention as vp-guard.ts. Every other role is
 * sent back to /dashboard.
 */
export async function requireCeoAccess(): Promise<AdminAccount> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  if (admin.role !== "ceo" && admin.role !== "hq") redirect("/dashboard");
  return admin;
}
