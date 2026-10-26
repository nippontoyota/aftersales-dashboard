import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";
import type { AdminAccount } from "@/lib/admin-store";

/**
 * Guards the kl_cluster role's one page. Same shape as vp-guard.ts's
 * requireVpAccess / region-guard.ts's requireRegionalRmAccess — anyone else
 * is sent back to /dashboard rather than shown an empty or mis-scoped page.
 */
export async function requireKlBranchesAccess(): Promise<AdminAccount> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  if (admin.role !== "kl_cluster") redirect("/dashboard");
  return admin;
}
