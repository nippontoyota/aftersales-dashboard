import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { loadGusLabourVasCounts } from "@/lib/gus-per-car-trend";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Backs the VP's GUS Labour/Car detail modal's "Labour job mix" section
 * (regions/page.tsx + gus-per-car-cell.tsx) — the GUS-only Wheel
 * Alignment/Balancing/Brake Skimming penetration %, fetched lazily only
 * when that modal opens for `metric=labour`. The day-by-day trend this
 * route used to also serve was dropped entirely 2026-09-25 (at the VP's
 * request, after it turned out to be the actual source of the modal's load
 * delay — 6 parallel queries reconstructing the whole month's history);
 * `metric=parts` now has nothing left to fetch, so the client skips calling
 * this route at all for that case. */
export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin || (admin.role !== "vp_service" && admin.role !== "hq")) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const branch = searchParams.get("branch");
  const date = searchParams.get("date");
  const metric = searchParams.get("metric");
  if (!branch) return NextResponse.json({ error: "branch is required." }, { status: 400 });
  if (!date || !DATE_RE.test(date)) return NextResponse.json({ error: "date must be YYYY-MM-DD." }, { status: 400 });
  if (metric !== "labour") return NextResponse.json({ vasCounts: null });

  const vasCounts = await loadGusLabourVasCounts(branch, date);
  return NextResponse.json({ vasCounts });
}
