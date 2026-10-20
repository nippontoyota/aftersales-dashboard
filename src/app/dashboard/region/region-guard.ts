import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";
import type { AdminAccount } from "@/lib/admin-store";

/**
 * This Set Targets page is for South and North — Central has its own,
 * richer version (TKM Targets included) at /dashboard/central/set-targets,
 * guarded by central-guard.ts's requireCentralRmAccess. Anyone else
 * (including Central and HQ) is sent back to /dashboard rather than shown
 * an empty or mis-scoped page. Same shape as vp-guard.ts's requireVpAccess.
 */
export async function requireRegionalRmAccess(): Promise<AdminAccount> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  if (admin.role !== "regional" || admin.region === "Central") redirect("/dashboard");
  return admin;
}
