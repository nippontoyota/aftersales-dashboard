import { pool } from "./db";

/**
 * Serializes work per key across however many concurrent serverless
 * invocations are running it, via a Postgres advisory lock (2026-11-20,
 * after deferring recompute work via after() let two uploads for the same
 * branch — e.g. two report types landing close together — each trigger
 * their own background recompute concurrently instead of one waiting for
 * the other; see close-sa-analytics/recompute.ts's and
 * cross-month-replacement.ts's callers). An in-process lock can't do this:
 * concurrent requests routinely land on separate server instances with no
 * shared memory, which is exactly how these races surfaced (duplicate-key
 * errors). A Postgres advisory lock lives in the database itself, so it's
 * shared correctly no matter which instance holds it.
 *
 * pg_try_advisory_lock (non-blocking), polled — NOT plain pg_advisory_lock
 * (blocking). Confirmed 2026-11-21: the blocking version made connection-
 * pool pressure *worse*, since every recompute waiting on the lock held its
 * own pool connection idle for the whole wait. Polling releases the
 * connection between attempts instead of holding one hostage. A maxWaitMs
 * safety valve gives up waiting and just runs anyway under sustained
 * contention rather than queuing forever — tolerable because every caller
 * of this reloads full state fresh each time, so losing the race just
 * means this attempt's output isn't used; a later successful run still
 * ends up correct.
 *
 * `scope` namespaces the lock key so unrelated work (e.g. close_sa_analytics
 * vs cross_month_replacements recomputes for the same branch) doesn't
 * serialize against each other unnecessarily — only calls with the same
 * (scope, key) pair ever contend.
 */
export async function withAdvisoryLock<T>(scope: string, key: string, work: () => Promise<T>): Promise<T> {
  const lockKey = "select pg_try_advisory_lock(hashtext($1)::bigint) as locked";
  const lockId = `${scope}:${key}`;
  const maxWaitMs = 20_000;
  const pollIntervalMs = 500;
  const deadline = Date.now() + maxWaitMs;

  while (true) {
    const client = await pool.connect();
    let gotLock = false;
    try {
      gotLock = (await client.query(lockKey, [lockId])).rows[0].locked;
      if (gotLock) return await work();
    } finally {
      if (gotLock) await client.query("select pg_advisory_unlock(hashtext($1)::bigint)", [lockId]).catch(() => {});
      client.release();
    }
    if (Date.now() > deadline) return work();
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}
