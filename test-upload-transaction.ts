/**
 * Tests for M1 — upload transaction atomicity.
 *
 * Verifies that saving a snapshot and its raw rows is atomic:
 *   1. Failure test: snapshot save succeeds, then raw-row save is simulated to
 *      fail. The whole transaction must roll back — snapshot must be absent so
 *      the branch can retry.
 *   2. Success test: both saves succeed inside one transaction. Snapshot AND
 *      raw rows must both be present afterwards.
 *
 * Uses a synthetic date (1970-01-01) and fake branch (TX_TEST) to avoid
 * touching any real production data. Cleans up after itself on both pass and fail.
 *
 * Run: npx tsx --env-file=.env.local test-upload-transaction.ts
 */
import pg from "pg";
import { saveRawUploadRows } from "./src/lib/raw-upload-rows/store.ts";
import { loadRawUploadRows } from "./src/lib/raw-upload-rows/store.ts";
import { saveServiceInfoSnapshot } from "./src/lib/service-info/store.ts";
import { loadServiceInfoSnapshot } from "./src/lib/service-info/store.ts";

const TEST_DATE = "1970-01-01";
const TEST_BRANCH = "TX_TEST";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

let passed = 0;
let failed = 0;

function ok(name: string) {
  console.log(`PASS  ${name}`);
  passed++;
}
function fail(name: string, reason: string) {
  console.error(`FAIL  ${name}: ${reason}`);
  failed++;
}

async function cleanup() {
  await pool.query(
    `delete from service_info_snapshots where date = $1 and branch = $2`,
    [TEST_DATE, TEST_BRANCH]
  );
  await pool.query(
    `delete from raw_upload_rows where report_type = 'service_info' and date = $1 and branch = $2`,
    [TEST_DATE, TEST_BRANCH]
  );
}

const fakeSnapshot = {
  date: TEST_DATE,
  branch: TEST_BRANCH,
  uploadedAt: new Date().toISOString(),
  sourceFileName: "test-transaction.xlsx",
  counts: { wheelBalancing: 1, wheelAlignment: 1, brakeSkimming: 1, evaporatorCleaning: 1, vasRevenue: 100 },
};

const fakeRows = [{ branch: TEST_BRANCH, data: { test: true } }];

// ── Test 1: rollback on raw-row failure ───────────────────────────────────────

async function testRollbackOnFailure() {
  await cleanup();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await saveServiceInfoSnapshot(fakeSnapshot, client);
    // Force failure: pass a deliberately bad reportType to trigger a DB error
    // (raw_upload_rows.report_type has a CHECK constraint limiting valid values)
    await saveRawUploadRows(
      { reportType: "INVALID_TYPE" as never, date: TEST_DATE, uploadedAt: fakeSnapshot.uploadedAt, sourceFileName: "test.xlsx", rows: fakeRows },
      client
    );
    // Should not reach here
    await client.query("commit");
    fail("rollback on raw-row failure", "transaction should have thrown but did not");
  } catch {
    await client.query("rollback");
    // Verify the snapshot was rolled back
    const snap = await loadServiceInfoSnapshot(TEST_DATE, TEST_BRANCH);
    if (!snap) {
      ok("rollback on raw-row failure: snapshot absent after rollback");
    } else {
      fail("rollback on raw-row failure", "snapshot survived rollback — orphan created");
    }
  } finally {
    client.release();
    await cleanup();
  }
}

// ── Test 2: success — both writes visible after commit ────────────────────────

async function testSuccessCommit() {
  await cleanup();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await saveServiceInfoSnapshot(fakeSnapshot, client);
    await saveRawUploadRows(
      { reportType: "service_info", date: TEST_DATE, uploadedAt: fakeSnapshot.uploadedAt, sourceFileName: "test.xlsx", rows: fakeRows },
      client
    );
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    fail("success commit", `transaction threw unexpectedly: ${err}`);
    return;
  } finally {
    client.release();
  }

  const snap = await loadServiceInfoSnapshot(TEST_DATE, TEST_BRANCH);
  if (snap) {
    ok("success commit: snapshot present after commit");
  } else {
    fail("success commit", "snapshot missing after commit");
  }

  const rows = await loadRawUploadRows("service_info", TEST_DATE, TEST_BRANCH);
  if (rows.length === 1) {
    ok("success commit: raw rows present after commit");
  } else {
    fail("success commit", `expected 1 raw row, got ${rows.length}`);
  }

  await cleanup();
}

// ── Test 3: standalone saveRawUploadRows still works (no regression) ──────────

async function testStandaloneRawRowSave() {
  await cleanup();
  // saveServiceInfoSnapshot standalone (no client)
  await saveServiceInfoSnapshot(fakeSnapshot);
  const snap = await loadServiceInfoSnapshot(TEST_DATE, TEST_BRANCH);
  if (snap) {
    ok("standalone saveServiceInfoSnapshot still works");
  } else {
    fail("standalone saveServiceInfoSnapshot", "snapshot missing");
  }
  // saveRawUploadRows standalone (no client)
  await saveRawUploadRows({
    reportType: "service_info",
    date: TEST_DATE,
    uploadedAt: fakeSnapshot.uploadedAt,
    sourceFileName: "test.xlsx",
    rows: fakeRows,
  });
  const rows = await loadRawUploadRows("service_info", TEST_DATE, TEST_BRANCH);
  if (rows.length === 1) {
    ok("standalone saveRawUploadRows still works");
  } else {
    fail("standalone saveRawUploadRows", `expected 1 row, got ${rows.length}`);
  }
  await cleanup();
}

async function main() {
  try {
    await testRollbackOnFailure();
    await testSuccessCommit();
    await testStandaloneRawRowSave();
  } finally {
    await cleanup();
    await pool.end();
  }
  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("Test runner error:", err);
  process.exitCode = 1;
});
