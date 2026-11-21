import { setDefaultResultOrder } from "node:dns";
import { Pool } from "pg";

/**
 * On a network using NAT64/DNS64, Supabase's pooler hostname can resolve to
 * a synthesized IPv6 address (visible as `64:ff9b::...` in connection
 * errors) alongside its real IPv4 addresses. Node tries every resolved
 * address in order; if that NAT64 route is flaky, it burns 10-20s timing
 * out on it before ever reaching a working IPv4 address. Preferring IPv4
 * first skips that wasted attempt. Doesn't fix a genuinely down network
 * path — only avoids picking the worse of two working ones first.
 */
setDefaultResultOrder("ipv4first");

/**
 * Shared Postgres connection pool (Supabase). One pool for the whole app —
 * `pg` handles connection reuse/queueing internally, so every store module
 * just imports `pool` and runs queries against it.
 */
function getPool(): Pool {
  const g = globalThis as unknown as { __pgPool?: Pool };
  if (!g.__pgPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set — see .env.local.");
    }
    const ca = process.env.DATABASE_CA_CERT;
    g.__pgPool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: true, ca },
      // Confirmed 2026-11-07: a long-running backfill script hung for 53
      // minutes with no error and no query visible in pg_stat_activity — a
      // network-level stall (packets silently dropped, no TCP reset) that
      // neither Postgres nor pg's own defaults time out on their own.
      // connectionTimeoutMillis bounds acquiring a connection; statement_timeout
      // (applied server-side via pg's own per-connection SET) and query_timeout
      // (the client-side mirror, slightly higher as a safety net if the
      // server-side one somehow doesn't fire) bound how long any query can
      // run. All generous relative to this app's slowest known real query
      // (~2.2s for the largest branch's full Service Info history, per
      // loadRoCloseSaPairs's own doc comment) — meant to catch a genuine
      // hang, not a merely-slow query.
      connectionTimeoutMillis: 15_000,
      statement_timeout: 60_000,
      query_timeout: 65_000,
      // Confirmed 2026-11-19: Supabase's pooler caps total client connections
      // at 200 project-wide. pg's own default `max` is 10 per Pool, and each
      // serverless instance gets its own Pool (globalThis is per-isolate) —
      // a burst of concurrent requests (e.g. a referrals table rendering 50
      // photo thumbnails at once) can spin up enough instances to blow past
      // that cap even though any single request here only ever needs one
      // connection at a time. Capping `max` low bounds the worst case.
      //
      // Raised 3 -> 6 (2026-11-21): 3 was tight enough that a single
      // instance doing real concurrent work for one request — e.g. an
      // upload's own save query, its after()-deferred recompute, and the
      // advisory-lock poll it runs under (see close-sa-analytics/
      // recompute.ts) — could exhaust its own 3 slots and start queuing,
      // which doesn't crash but shows up as requests (including an
      // unrelated /login on the same instance) going silently slow instead
      // of erroring. Watch Supabase/Vercel for EMAXCONN returning under
      // heavy concurrent instance counts — that would mean 6 is too high
      // again and needs splitting the difference instead.
      max: 6,
    });
    // pg's Pool emits 'error' on an idle client when its connection drops
    // server-side (confirmed 2026-11-07: a long-running backfill script hit
    // this and crashed outright) — without a listener, Node's default
    // behavior for an unhandled EventEmitter 'error' is to throw and kill
    // the process. pg already discards that dead client and opens a fresh
    // one for the next query on its own; this handler's only job is to stop
    // that from being fatal. Logged, not swallowed silently, so a real
    // connectivity problem is still visible.
    g.__pgPool.on("error", (err) => {
      console.error("Postgres pool idle client error (recovered):", err);
    });
  }
  return g.__pgPool;
}

export const pool = getPool();
