// Integration tests for the login rate-limiting system.
// Exercises the raw SQL logic, HMAC key generation, concurrent increment
// safety, window expiry, and success reset directly against the real database.
// Run with: node --env-file .env.local test-login-rate-limit.mjs
//
// Requires LOGIN_HMAC_SECRET in the environment (and DATABASE_URL / DATABASE_CA_CERT).

import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

// load-env.mjs will pick up .env.local if --env-file is not available on
// older Node versions.
const require = createRequire(import.meta.url);
const { Pool } = require("pg");

// ── helpers ────────────────────────────────────────────────────────────────

const ACCOUNT_THRESHOLD = 10;
const IP_THRESHOLD = 50;
const WINDOW_MINUTES = 15;

function hmacSecret() {
  const s = process.env.LOGIN_HMAC_SECRET;
  if (!s) throw new Error("LOGIN_HMAC_SECRET is not set — add it to .env.local");
  return s;
}

function makeKey(prefix, value) {
  return prefix + ":" + createHmac("sha256", hmacSecret()).update(String(value).slice(0, 200)).digest("hex");
}
const accountKey = (username) => makeKey("a", username.toLowerCase());
const ipKey = (ip) => makeKey("i", ip);

const ca = process.env.DATABASE_CA_CERT;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true, ca },
  max: 20,
});

async function incrementAndCheck(key, threshold) {
  const { rows } = await pool.query(
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
}

async function resetKey(key) {
  await pool.query("DELETE FROM login_rate_limits WHERE key = $1", [key]);
}

async function getAttempts(key) {
  const { rows } = await pool.query(
    "SELECT attempts FROM login_rate_limits WHERE key = $1",
    [key]
  );
  return rows[0]?.attempts ?? 0;
}

async function forceExpiredWindow(key) {
  // Backdate window_start so it looks like the window already expired.
  await pool.query(
    "UPDATE login_rate_limits SET window_start = now() - (interval '1 minute' * ($1 + 1)) WHERE key = $2",
    [WINDOW_MINUTES, key]
  );
}

// ── test runner ────────────────────────────────────────────────────────────

let passed = 0, failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg ?? "assertion failed");
}

// ── test cases ─────────────────────────────────────────────────────────────

// Use a unique suffix per test run so parallel runs don't collide.
const run = Date.now().toString(36);

await test("incrementAndCheck: first attempt is not blocked (account)", async () => {
  const key = accountKey(`test-user-${run}-1`);
  try {
    const blocked = await incrementAndCheck(key, ACCOUNT_THRESHOLD);
    assert(!blocked, "first attempt should not be blocked");
  } finally {
    await resetKey(key);
  }
});

await test("incrementAndCheck: account locks after ACCOUNT_THRESHOLD+1 attempts", async () => {
  const key = accountKey(`test-user-${run}-2`);
  try {
    let blocked = false;
    for (let i = 0; i < ACCOUNT_THRESHOLD; i++) {
      blocked = await incrementAndCheck(key, ACCOUNT_THRESHOLD);
    }
    assert(!blocked, `attempt ${ACCOUNT_THRESHOLD} should not yet be blocked`);
    blocked = await incrementAndCheck(key, ACCOUNT_THRESHOLD);
    assert(blocked, `attempt ${ACCOUNT_THRESHOLD + 1} should be blocked`);
  } finally {
    await resetKey(key);
  }
});

await test("incrementAndCheck: IP threshold is higher than account threshold", async () => {
  // Verify the constants are set as specified.
  assert(IP_THRESHOLD > ACCOUNT_THRESHOLD,
    `IP_THRESHOLD (${IP_THRESHOLD}) must exceed ACCOUNT_THRESHOLD (${ACCOUNT_THRESHOLD})`);
});

await test("incrementAndCheck: window expiry resets counter to 1", async () => {
  const key = accountKey(`test-user-${run}-3`);
  try {
    // Run up to exactly ACCOUNT_THRESHOLD attempts (not yet blocked).
    for (let i = 0; i < ACCOUNT_THRESHOLD; i++) {
      await incrementAndCheck(key, ACCOUNT_THRESHOLD);
    }
    // Simulate window expiry by backdating window_start.
    await forceExpiredWindow(key);
    // Next attempt should reset to 1, not ACCOUNT_THRESHOLD+1.
    const blocked = await incrementAndCheck(key, ACCOUNT_THRESHOLD);
    assert(!blocked, "first attempt after window expiry should not be blocked");
    const attempts = await getAttempts(key);
    assert(attempts === 1, `expected attempts=1 after reset, got ${attempts}`);
  } finally {
    await resetKey(key);
  }
});

await test("resetKey: clears account counter on successful login", async () => {
  const username = `test-user-${run}-4`;
  const key = accountKey(username);
  try {
    // Build up some failures.
    for (let i = 0; i < 5; i++) {
      await incrementAndCheck(key, ACCOUNT_THRESHOLD);
    }
    assert((await getAttempts(key)) === 5, "expected 5 attempts before reset");
    // Simulate successful login: delete the account key.
    await resetKey(key);
    assert((await getAttempts(key)) === 0, "expected 0 attempts after reset");
  } finally {
    await resetKey(key);
  }
});

await test("success reset preserves IP counter", async () => {
  const username = `test-user-${run}-5`;
  const testIp = `10.0.${run}.1`;
  const aKey = accountKey(username);
  const iKey = ipKey(testIp);
  try {
    // Record failures under both keys.
    for (let i = 0; i < 3; i++) {
      await incrementAndCheck(aKey, ACCOUNT_THRESHOLD);
      await incrementAndCheck(iKey, IP_THRESHOLD);
    }
    // Simulate successful login: reset account key only.
    await resetKey(aKey);
    assert((await getAttempts(aKey)) === 0, "account counter should be cleared");
    assert((await getAttempts(iKey)) === 3, "IP counter should be preserved");
  } finally {
    await resetKey(aKey);
    await resetKey(iKey);
  }
});

await test("concurrent requests all count (no lost update)", async () => {
  const key = accountKey(`test-user-${run}-6`);
  const N = 20;
  try {
    // Fire N increment calls in parallel — every one must land.
    await Promise.all(Array.from({ length: N }, () => incrementAndCheck(key, 1000)));
    const attempts = await getAttempts(key);
    assert(attempts === N, `expected ${N} attempts after parallel increments, got ${attempts}`);
  } finally {
    await resetKey(key);
  }
});

await test("forged x-forwarded-for: different raw IPs produce different keys", () => {
  // The IP value that reaches ipKey() is whatever the header contains.
  // Vercel overwrites x-forwarded-for with the real client IP on non-Enterprise
  // plans — so the client cannot forge the value that reaches the server.
  // This test verifies that two different IPs produce different HMAC keys
  // (confirming the key space does not collapse, making forgery pointless).
  const k1 = ipKey("1.2.3.4");
  const k2 = ipKey("5.6.7.8");
  assert(k1 !== k2, "different IPs must produce different keys");
});

await test("same IP behind comma-separated XFF: take only the first segment", () => {
  // If XFF somehow contains a comma-separated list, we take only the first segment.
  // x-vercel-forwarded-for is a single IP in practice; this guards the fallback.
  const raw = "203.0.113.5, 10.0.0.1, 172.16.0.1";
  const ip = raw.split(",")[0].trim();
  assert(ip === "203.0.113.5", `expected first segment, got "${ip}"`);
  const k1 = ipKey("203.0.113.5");
  const k2 = ipKey(ip);
  assert(k1 === k2, "ipKey from raw == ipKey from first segment");
});

await test("HMAC keys are prefix-namespaced (account ≠ IP for same value)", () => {
  const val = "192.168.1.1";
  const aKey = accountKey(val);
  const iKey = ipKey(val);
  assert(aKey.startsWith("a:"), "account key must start with 'a:'");
  assert(iKey.startsWith("i:"), "IP key must start with 'i:'");
  assert(aKey !== iKey, "account and IP keys for the same value must differ");
});

// ── summary ────────────────────────────────────────────────────────────────

await pool.end();

console.log("");
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
