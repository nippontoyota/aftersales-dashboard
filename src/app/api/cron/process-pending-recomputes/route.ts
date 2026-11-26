import { NextResponse } from "next/server";
import { processPendingRecomputes } from "@/lib/pending-recomputes/process";

// Matches /data's own "Run pending recomputes" button — see vercel.json for
// the schedule (10:30 AM IST daily): after the CTDMS automation's own
// upload window (~7-10 AM IST) so they never compete for the same DB
// connections/CPU again, but early enough that results are ready well
// before the day's reports get looked at — see process.ts's doc comment
// for the full story of why the overlap mattered.
export const maxDuration = 300;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await processPendingRecomputes();
  return NextResponse.json(result);
}
