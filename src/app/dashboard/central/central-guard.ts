import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";
import type { AdminAccount } from "@/lib/admin-store";

/**
 * TKM Targets and Set Targets (2026-09-26) are Central-region-only — North
 * and South regional managers have none of this tooling, so anyone else
 * (including HQ) is sent back to /dashboard rather than shown an empty or
 * mis-scoped page. Same shape as vp-guard.ts's requireVpAccess.
 */
export async function requireCentralRmAccess(): Promise<AdminAccount> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  if (admin.role !== "regional" || admin.region !== "Central") redirect("/dashboard");
  return admin;
}
