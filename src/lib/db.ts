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
    g.__pgPool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  }
  return g.__pgPool;
}

export const pool = getPool();
