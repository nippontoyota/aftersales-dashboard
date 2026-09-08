import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";
import type { AdminAccount } from "@/lib/admin-store";

/**
 * The /vp section is the VP Service executive view. `vp_service` lives here;
 * HQ is also let in — read-only, so they can see exactly what the VP sees
 * and answer his query flags. Every other role is sent back to /dashboard.
 */
export async function requireVpAccess(): Promise<AdminAccount> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  if (admin.role !== "vp_service" && admin.role !== "hq") redirect("/dashboard");
  return admin;
}
