import { listBranchCodes } from "@/lib/admin-store";
import { SignupForm } from "./signup-form";

/** Public — anyone can request a branch-admin account for themselves here.
 * The request doesn't create a working login by itself; it needs HQ to
 * approve it first (see /account-requests). Proxy.ts treats this the same
 * as /login: reachable while signed out, redirected away from once signed
 * in. */
export default async function SignupPage() {
  const branchCodes = await listBranchCodes();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-md border border-slate-200 bg-white p-6">
        <h1 className="text-base font-semibold text-slate-900">Request an account</h1>
        <p className="mt-1 text-sm text-slate-500">
          Nippon Toyota internal system. Your account works only after HQ approves this request.
        </p>
        <SignupForm branchCodes={branchCodes} />
      </div>
    </div>
  );
}
