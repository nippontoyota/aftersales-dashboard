import Link from "next/link";
import type { AdminAccount } from "@/lib/admin-store";
import { listVpFlags, listVpFlagsForRegion } from "@/lib/vp-flags/store";
import { VpFlagThread } from "@/app/vp/vp-flag-thread";

/**
 * VP Service query flags, surfaced on /alerts. HQ sees every open flag and
 * can reply inline; a regional manager sees the open flags that touch a
 * branch in their region, read-only. Everyone else gets nothing.
 */
export async function VpFlagsPanel({ admin }: { admin: AdminAccount }) {
  if (admin.role !== "hq" && admin.role !== "regional") return null;

  const flags =
    admin.role === "hq" ? await listVpFlags() : await listVpFlagsForRegion(admin.region);
  const open = flags.filter((f) => f.status !== "closed");
  if (open.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-info/30 bg-info-soft/50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-info">
          VP Service — {open.length} open quer{open.length === 1 ? "y" : "ies"}
        </span>
        {admin.role === "hq" ? (
          <Link href="/vp/queries" className="text-[12px] font-medium text-info hover:underline">
            All queries →
          </Link>
        ) : null}
      </div>
      <div className="mt-2 space-y-2">
        {open.map((f) => (
          <VpFlagThread key={f.id} flag={f} canReply={admin.role === "hq"} canManage={admin.role === "hq"} />
        ))}
      </div>
    </div>
  );
}
