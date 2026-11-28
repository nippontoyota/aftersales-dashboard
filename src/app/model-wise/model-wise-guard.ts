import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";
import type { AdminAccount } from "@/lib/admin-store";
import { REGIONS, type RegionName } from "@/lib/regions";

/**
 * /model-wise (Toyota/Alliance/Lexus revenue split) — hq, vp_service,
 * regional (own region only) and branch (own branch only), per the user's
 * explicit request (2026-11-21); extended to bp_manager (own branch only)
 * 2026-11-28, once BP Manager accounts got the full branch-style sidebar nav.
 * Every other role is sent back to /dashboard, same convention as
 * accounts-guard.ts/vp-guard.ts.
 */
export async function requireModelWiseAccess(): Promise<AdminAccount> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  if (admin.role !== "hq" && admin.role !== "vp_service" && admin.role !== "regional" && admin.role !== "branch" && admin.role !== "bp_manager") {
    redirect("/dashboard");
  }
  return admin;
}

/** The branch codes this admin may see — their own region/branch, or null
 * for hq/vp_service (full company, no restriction). */
export function modelWiseScopeBranches(admin: AdminAccount): string[] | null {
  if (admin.role === "regional") return [...REGIONS[admin.region as RegionName]];
  if (admin.role === "branch" || admin.role === "bp_manager") return [admin.branch];
  return null;
}
