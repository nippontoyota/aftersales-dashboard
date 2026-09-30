import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { pool } from "./db";

// Per-account: 10 failures in 15 minutes → temporary lockout
// Per-IP: 50 failures in 15 minutes (higher to avoid blocking a shared branch-office IP)
const ACCOUNT_THRESHOLD = 10;
const IP_THRESHOLD = 50;
const WINDOW_MINUTES = 15;

function hmacSecret(): string {
  const s = process.env.LOGIN_HMAC_SECRET;
  if (!s) throw new Error("LOGIN_HMAC_SECRET is not set");
  return s;
}

export function accountKey(username: string): string {
  return "a:" + createHmac("sha256", hmacSecret()).update(username.slice(0, 200)).digest("hex");
}

export function ipKey(ip: string): string {
  return "i:" + createHmac("sha256", hmacSecret()).update(ip.slice(0, 45)).digest("hex");
}

// Atomically increments the attempt counter and returns true when the count
// exceeds threshold. A single upsert handles both the insert-first-attempt and
// increment-existing cases, and also resets an expired window in the same
// round-trip. Fails closed (returns true) on any DB error.
export async function incrementAndCheck(key: string, threshold: number): Promise<boolean> {
  try {
    const { rows } = await pool.query<{ attempts: number }>(
      `INSERT INTO login_rate_limits (key, attempts, window_start)
       VALUES ($1, 1, now())
       ON CONFLICT (key) DO UPDATE SET
         attempts     = CASE
                          WHEN login_rate_limits.window_start < now() - (interval '1 minute' * $2)
                          THEN 1
                          ELSE login_rate_limits.attempts + 1
                        END,
         window_start = CASE
                          WHEN login_rate_limits.window_start < now() - (interval '1 minute' * $2)
                          THEN now()
                          ELSE login_rate_limits.window_start
                        END
       RETURNING attempts`,
      [key, WINDOW_MINUTES]
    );
    return (rows[0]?.attempts ?? 0) > threshold;
  } catch (err) {
    console.error("[login-rate-limit] DB error:", err);
    return true;
  }
}

// Clears the account counter on successful login.
// Preserves IP rows — they decay naturally after the window expires.
export async function resetAccountLimit(username: string): Promise<void> {
  try {
    await pool.query("DELETE FROM login_rate_limits WHERE key = $1", [accountKey(username)]);
  } catch {
    // Non-fatal: worst case, the account counter expires naturally after WINDOW_MINUTES.
  }
}

// Called from loginAction before the password check. Pre-increments both the
// per-account and per-IP counters in a single parallel round-trip so concurrent
// requests all count before any password check runs. Returns true if either
// counter is over threshold.
export async function checkRateLimits(username: string): Promise<boolean> {
  const h = await headers();
  // x-vercel-forwarded-for: Vercel's own canonical IP header; not overwritten
  // by a proxy in front of Vercel. x-forwarded-for is identical on a direct
  // Vercel deployment (no proxy) and is the documented fallback.
  const rawIp =
    h.get("x-vercel-forwarded-for") ?? h.get("x-forwarded-for") ?? "unknown";
  const ip = rawIp.split(",")[0].trim() || "unknown";

  // 1% of requests trigger an asynchronous cleanup of rows older than 24 hours.
  if (Math.random() < 0.01) {
    pool
      .query("DELETE FROM login_rate_limits WHERE window_start < now() - interval '24 hours'")
      .catch(() => {});
  }

  const [accountBlocked, ipBlocked] = await Promise.all([
    incrementAndCheck(accountKey(username), ACCOUNT_THRESHOLD),
    incrementAndCheck(ipKey(ip), IP_THRESHOLD),
  ]);

  return accountBlocked || ipBlocked;
}
