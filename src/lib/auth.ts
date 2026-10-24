import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { findAdmin, verifyAdminPassword, type AdminAccount } from "./admin-store";

/**
 * Local admin logins — no database, no Supabase. Accounts (hashed passwords
 * + role/branch) live in data/admins.json (see admin-store.ts and
 * scripts/seed-admins.mjs); the session itself is still a stateless
 * HMAC-signed cookie (username + expiry, signed with SESSION_SECRET) so
 * there's nothing to persist server-side for "is this request logged in" —
 * role/branch are looked up fresh from admin-store on each request that
 * needs them (see getCurrentAdmin()) rather than baked into the cookie.
 */
const SESSION_COOKIE = "admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/** Non-httpOnly, unsigned — readable by client JS. Its only job is to change
 * value on every fresh login, so the queries login pop-up (see
 * query-popup-gate.tsx) can tell "a new login just happened" apart from "the
 * user is just navigating between pages within the same login" without a
 * server round trip. Carries no security meaning of its own — the real
 * session is still the signed, httpOnly admin_session cookie above. */
const LOGIN_MARKER_COOKIE = "login_marker";

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set — see .env.local.");
  }
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("hex");
}

/** Verifies username/password against data/admins.json; returns the matched account (with its role) or null. */
export async function checkCredentials(username: string, password: string): Promise<AdminAccount | null> {
  return verifyAdminPassword(username, password);
}

export async function createSession(username: string) {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${username}.${expiresAt}`;
  const token = `${payload}.${sign(payload)}`;
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
  cookieStore.set(LOGIN_MARKER_COOKIE, String(expiresAt), {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(LOGIN_MARKER_COOKIE);
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;

/**
 * Pure verification — takes the raw cookie value, not the cookie jar. Kept
 * separate from getSessionUser() below because `next/headers`'s cookies()
 * is only usable in Server Components/Route Handlers, not in proxy.ts
 * (which reads the cookie off NextRequest instead — see src/proxy.ts).
 */
export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null;

  // Split from the right, not token.split(".") into exactly 3 parts — a
  // username containing a literal "." (e.g. "biju.kollam", added 2026-10-24
  // for the kl_cluster role) has more than 2 dots in the token, so a
  // 3-part split silently rejected every one of its sessions as malformed,
  // bouncing it straight back to /login with no error at all. expiresAt and
  // the hex signature never contain a dot themselves, so the last two
  // dot-delimited segments are always exactly those two, whatever the
  // username contains.
  const lastDot = token.lastIndexOf(".");
  const secondLastDot = lastDot === -1 ? -1 : token.lastIndexOf(".", lastDot - 1);
  if (lastDot === -1 || secondLastDot === -1) return null;
  const username = token.slice(0, secondLastDot);
  const expiresAtStr = token.slice(secondLastDot + 1, lastDot);
  const signature = token.slice(lastDot + 1);
  const payload = `${username}.${expiresAtStr}`;

  let expectedSig: string;
  try {
    expectedSig = sign(payload);
  } catch {
    return null;
  }

  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

  return username;
}

/** Server Components/Route Handlers/Server Actions only — see verifySessionToken() for proxy.ts. */
export async function getSessionUser(): Promise<string | null> {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

/** The logged-in admin's full account (role + branch, if any) — null if not signed in. */
export async function getCurrentAdmin(): Promise<AdminAccount | null> {
  const username = await getSessionUser();
  if (!username) return null;
  return findAdmin(username);
}
