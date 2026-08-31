import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

const PUBLIC_PATHS = ["/login"];

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
    homeUrl.pathname = "/upload";
    return NextResponse.redirect(homeUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
