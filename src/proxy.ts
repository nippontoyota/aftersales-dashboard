import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { findAdmin } from "@/lib/admin-store";

// /api/revenue_stream_fill is the internal Python function
// (api/revenue_stream_fill.py) — only ever called server-to-server from the
// already HQ-admin-gated /api/hq/revenue-stream-export route, which can't
// forward its caller's session cookie through a fresh fetch(). Same
// unauthenticated-by-necessity situation as /api/webhooks below.
const PUBLIC_PATHS = ["/login", "/api/sso", "/api/webhooks", "/api/revenue_stream_fill"];

/**
 * Next.js 16 renamed `middleware.ts` to `proxy.ts`. Runs on every request;
 * proxy always executes in the Node runtime (unlike the old edge middleware),
 * which is what lets the session check here use node:crypto directly.
 * Reads the cookie off NextRequest (not next/headers' cookies(), which
 * isn't available in this context) and verifies it with the same pure
 * function Server Components use — see lib/auth.ts.
 */
export async function proxy(request: NextRequest) {
  const isPublicPath = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));
  const user = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (!user && !isPublicPath) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  if (user && isPublicPath) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    return NextResponse.redirect(homeUrl);
  }

  if (user) {
    // findAdmin hits Postgres on every authenticated request here. A DB
    // hiccup must not 500 every route for every user — on a query failure,
    // skip the extra CE-role routing below and let the page's own
    // getCurrentAdmin()/role check (which every page already has) enforce
    // access for that one request instead, rather than failing the proxy
    // for every route and every user at once.
    let admin: Awaited<ReturnType<typeof findAdmin>>;
    try {
      admin = await findAdmin(user);
    } catch (error) {
      console.error("proxy: findAdmin failed", error);
      return NextResponse.next();
    }
    if (!admin) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      return NextResponse.redirect(loginUrl);
    }
    const path = request.nextUrl.pathname;
    const isCePath = path === "/ce" || path.startsWith("/ce/");
    if (admin.role === "ce" && path !== "/" && !isCePath) {
      if (path.startsWith("/api/")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
      const ceUrl = request.nextUrl.clone();
      ceUrl.pathname = "/ce";
      ceUrl.search = "";
      return NextResponse.redirect(ceUrl);
    }
    if (admin.role !== "ce" && admin.role !== "hq" && isCePath) {
      const homeUrl = request.nextUrl.clone();
      homeUrl.pathname = "/";
      homeUrl.search = "";
      return NextResponse.redirect(homeUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
