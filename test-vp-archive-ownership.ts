/**
 * Tests for L4 — VP archive thread-ownership enforcement.
 *
 * Verifies that setVpQueryThreadArchived:
 *   - returns true and archives when createdBy matches the thread's owner
 *   - returns false and leaves the thread unchanged when createdBy does not match
 *   - returns false when the thread id does not exist
 *
 * Run: npx tsx --env-file=.env.local test-vp-archive-ownership.ts
 */
import { pool } from "./src/lib/db.ts";
import { setVpQueryThreadArchived } from "./src/lib/vp-flags/store.ts";

let passed = 0;
let failed = 0;

function assert(name: string, actual: boolean, expected: boolean) {
  if (actual === expected) {
    console.log(`PASS  ${name}`);
    passed++;
  } else {
    console.error(`FAIL  ${name}: got ${actual}, expected ${expected}`);
    failed++;
  }
}

async function insertTestThread(createdBy: string): Promise<number> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into vp_query_threads (created_by, context_page, note)
     values ($1, 'overview', 'test-vp-archive-ownership fixture — safe to delete')
     returning id`,
    [createdBy]
  );
  return Number(rows[0].id);
}

async function isArchived(id: number): Promise<boolean> {
  const { rows } = await pool.query<{ archived: boolean }>(
    `select archived from vp_query_threads where id = $1`,
    [id]
  );
  return rows[0]?.archived ?? false;
}

async function deleteThread(id: number): Promise<void> {
  await pool.query(`delete from vp_query_recipients where thread_id = $1`, [id]);
  await pool.query(`delete from vp_query_threads where id = $1`, [id]);
}

async function main() {
  // Need two real admin usernames to satisfy the FK on vp_query_threads.created_by.
  // Any two distinct accounts will do — we're only testing the WHERE clause logic.
  const { rows: adminRows } = await pool.query<{ username: string }>(
    `select username from admins order by username limit 2`
  );
  if (adminRows.length < 2) {
    console.error("Need at least 2 admin accounts in DB to run this test.");
    process.exitCode = 1;
    await pool.end();
    return;
  }
  const OWNER = adminRows[0].username;
  const OTHER = adminRows[1].username;

  let threadId = 0;
  try {
    threadId = await insertTestThread(OWNER);

    // Wrong owner — should be denied, thread stays unarchived
    const denied = await setVpQueryThreadArchived(threadId, true, OTHER);
    assert("wrong owner returns false", denied, false);
    assert("thread stays unarchived after wrong-owner attempt", await isArchived(threadId), false);

    // Correct owner — should succeed
    const allowed = await setVpQueryThreadArchived(threadId, true, OWNER);
    assert("correct owner returns true", allowed, true);
    assert("thread is now archived", await isArchived(threadId), true);

    // Reopen by correct owner
    const reopened = await setVpQueryThreadArchived(threadId, false, OWNER);
    assert("correct owner can reopen", reopened, true);
    assert("thread is now open again", await isArchived(threadId), false);

    // Non-existent thread id
    const ghost = await setVpQueryThreadArchived(999_999_999, true, OWNER);
    assert("non-existent thread returns false", ghost, false);
  } finally {
    if (threadId) await deleteThread(threadId);
    await pool.end();
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
