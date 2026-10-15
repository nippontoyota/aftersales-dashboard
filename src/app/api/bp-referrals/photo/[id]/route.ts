import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { REGIONS } from "@/lib/regions";
import { regionalLeadFor } from "@/lib/bp-referrals/store";

/**
 * Proxies a BP referral's vehicle photo from Doubletick's media storage.
 * Doubletick's media URLs (data-storage.doubletick.io/...) aren't public —
 * they require an `Authorization: <public API key>` header on every
 * request (confirmed against their own docs, 2026-10-15:
 * docs.doubletick.io/docs/getting-started-with-doubletick-webhooks#accessing-media-urls).
 * A plain <img src> can never carry that header, so the frontend points at
 * this route instead, which fetches server-side (where the key lives) and
 * streams the bytes back.
 *
 * DOUBLETICK_API_KEY isn't set yet as of 2026-10-15 — the person who
 * originally wired up the WhatsApp bot has it, not this app's user. Until
 * it's added to the environment, every photo request here returns a
 * placeholder SVG explaining that, rather than a broken-image icon — the
 * moment the env var is set (no code change needed), real photos start
 * flowing through automatically.
 */
/** Wraps `message` onto multiple centered tspan lines so it never overflows
 * the 320px-wide placeholder, whether shown as a small thumbnail or full-size
 * in the lightbox. */
function wrapLines(message: string, maxCharsPerLine = 28): string[] {
  const words = message.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function placeholderSvg(message: string): string {
  const lines = wrapLines(message);
  const startY = 130 - (lines.length - 1) * 7;
  const tspans = lines
    .map((line, i) => `<tspan x="50%" y="${startY + i * 16}">${line.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</tspan>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">
    <rect width="100%" height="100%" fill="#e5e7eb"/>
    <text x="50%" y="95" dominant-baseline="middle" text-anchor="middle" font-size="20">📷</text>
    <text text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" fill="#6b7280">${tspans}</text>
  </svg>`;
}

function svgResponse(message: string, status = 200) {
  return new NextResponse(placeholderSvg(message), {
    status,
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" },
  });
}

async function hasAccess(admin: NonNullable<Awaited<ReturnType<typeof getCurrentAdmin>>>, assignedBranch: string | null): Promise<boolean> {
  if (admin.role === "bp_ho" || admin.role === "hq") return true;
  if (admin.role !== "bp_manager") return false;
  if (assignedBranch === admin.branch) return true;
  const region = regionalLeadFor(admin.branch);
  if (region && assignedBranch && (REGIONS[region] as readonly string[]).includes(assignedBranch)) return true;
  return false;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await params;
  const referralId = Number(id);
  if (!Number.isFinite(referralId)) {
    return NextResponse.json({ error: "Bad referral id." }, { status: 400 });
  }

  const { rows } = await pool.query<{ vehicle_image_url: string | null; assigned_branch: string | null }>(
    `select vehicle_image_url, assigned_branch from bp_referrals where id = $1`,
    [referralId],
  );
  const referral = rows[0];
  if (!referral || !referral.vehicle_image_url) {
    return svgResponse("No photo", 404);
  }

  if (!(await hasAccess(admin, referral.assigned_branch))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const apiKey = process.env.DOUBLETICK_API_KEY;
  if (!apiKey) {
    return svgResponse("Photo pending access — Doubletick API key not yet configured");
  }

  let upstream: Response;
  try {
    upstream = await fetch(referral.vehicle_image_url, { headers: { Authorization: apiKey } });
  } catch {
    return svgResponse("Couldn't reach photo storage");
  }
  if (!upstream.ok) {
    return svgResponse(upstream.status === 401 || upstream.status === 403 ? "Photo access denied by Doubletick" : "Photo unavailable");
  }

  const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
  const bytes = await upstream.arrayBuffer();
  return new NextResponse(bytes, {
    headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=3600" },
  });
}
