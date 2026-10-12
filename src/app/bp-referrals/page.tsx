import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { adminIdentityLabel } from "@/lib/admin-store";
import { getCurrentAdmin } from "@/lib/auth";
import { loadNavState } from "@/lib/dashboard-data";
import { pool } from "@/lib/db";
import { BpReferralsClient } from "./bp-referrals-client";

export type BpReferral = {
  id: number;
  referring_employee_id: string | null;
  referring_employee_name: string | null;
  referring_employee_branch: string | null;
  vehicle_image_url: string | null;
  customer_phone: string | null;
  submitted_at: Date | string | null;
  vehicle_reg_no: string | null;
  location: string | null;
  description: string | null;
};

async function loadReferrals(): Promise<{ referrals: BpReferral[]; branches: string[] }> {
  const [referralsRes, branchesRes] = await Promise.all([
    pool.query<BpReferral>(
      `SELECT id, referring_employee_id, referring_employee_name, referring_employee_branch,
              vehicle_image_url, customer_phone, submitted_at, vehicle_reg_no, location, description
       FROM bp_referrals ORDER BY submitted_at DESC`,
    ),
    pool.query<{ referring_employee_branch: string }>(
      `SELECT DISTINCT referring_employee_branch FROM bp_referrals
       WHERE referring_employee_branch IS NOT NULL AND referring_employee_branch <> ''
       ORDER BY referring_employee_branch`,
    ),
  ]);
  return {
    referrals: referralsRes.rows,
    branches: branchesRes.rows.map((r) => r.referring_employee_branch),
  };
}

export default async function BpReferralsPage() {
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== "hq") redirect("/dashboard");

  const [navState, { referrals, branches }] = await Promise.all([loadNavState(admin), loadReferrals()]);

  return (
    <AppShell
      current="bp-referrals"
      showDashboardLink={true}
      isHq={true}
      companyTabs={navState.companyTabs}
      queriesBadge={navState.queriesBadge}
      identity={adminIdentityLabel(admin)}
    >
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-fg">BP Referrals</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Customer vehicle referrals submitted by employees via WhatsApp — {referrals.length} total.
          </p>
        </div>
        <BpReferralsClient referrals={referrals} branches={branches} />
      </div>
    </AppShell>
  );
}
