import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";
import { indiaDate } from "@/lib/ce/rules";
import { CeShell } from "./ce-shell";
import { LeadsView } from "./leads-view";

export default async function CePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  if (admin.role !== "ce" && admin.role !== "hq") redirect("/");
  return <CeShell admin={admin} current="leads"><LeadsView active editable={admin.role === "ce"} today={indiaDate()} searchParams={searchParams} /></CeShell>;
}
