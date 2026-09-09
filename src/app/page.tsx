import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";

export default async function RootPage() {
  const admin = await getCurrentAdmin();
  if (admin?.role === "vp_service") redirect("/vp");
  redirect(admin?.canViewDashboard ? "/dashboard" : "/upload");
}
