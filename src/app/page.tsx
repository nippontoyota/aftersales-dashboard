import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";

export default async function RootPage() {
  const admin = await getCurrentAdmin();
  if (admin?.role === "vp_service") redirect("/vp");
  if (admin?.role === "ceo") redirect("/ceo");
  if (admin?.role === "accounts") redirect("/accounts");
  if (admin?.role === "ce") redirect("/ce");
  redirect(admin?.canViewDashboard ? "/dashboard" : "/upload");
}
