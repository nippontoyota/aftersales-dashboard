import type { AdminAccount } from "./admin-store";
import { listBranchCodes } from "./admin-store";

/**
 * Resolves which branch an upload is for. A "branch" account's identity IS
 * the branch — unchanged, and still the only thing trusted for every other
 * role. The one exception is "automation" (the CTDMS automation's single
 * login, 2026-11-26): it can upload as any branch, so the branch comes from
 * an explicit form field instead, validated against listBranchCodes() so a
 * missing or malformed value can never silently write under a wrong (or
 * made-up) branch code. Every other role is still rejected by each upload
 * route's own `admin.role !== "branch" && admin.role !== "automation"` guard
 * before this is ever called.
 */
export async function resolveUploadBranch(admin: AdminAccount, formData: FormData): Promise<{ branch: string } | { error: string }> {
  if (admin.role === "branch") {
    return { branch: admin.branch };
  }
  if (admin.role === "automation") {
    const branch = formData.get("branch");
    if (typeof branch !== "string" || !branch) {
      return { error: "Missing branch field." };
    }
    const validBranches = await listBranchCodes();
    if (!validBranches.includes(branch)) {
      return { error: `Unknown branch: ${branch}` };
    }
    return { branch };
  }
  return { error: "Only a branch or automation account can upload." };
}
