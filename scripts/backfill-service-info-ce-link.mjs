import pg from "pg";
import "./load-env.mjs";
import { extractServiceInfoVisits, LINK_SERVICE_INFO_VISITS_SQL, toServiceInfoLinkRecords } from "../src/lib/ce/service-info-visits.ts";

// One-time backfill for service-info-link.ts, which only links NEW
// Service Info uploads into ce_leads going forward (deployed
// 2026-10-30). Every upload before that date never ran the link step,
// so ce_leads can still be stale for a visit that already happened.
// This replays every historical service_info batch through the exact
// same extraction + "only if newer" SQL, in chronological order, so the
// end state is identical to what it would have been if the hook had
// existed since day one. See project_mrs_n9_system.md.
//
// Each batch commits (or rolls back, for a dry run) on its own — not one
// transaction for the whole run — so this never holds ce_leads row locks
// for more than a moment at a time against a live production database,
// and a dropped connection partway through only loses the one in-flight
// batch, not the whole backfill (safe to re-run: the "only if newer"
// guard makes every batch idempotent). Reconnects automatically on a
// connection drop (confirmed this happens over ~1000 sequential
// round-trips against Supabase's pooler) instead of crashing.

const apply = process.argv.includes("--apply");

function newClient() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  client.on("error", (err) => console.error("connection error (will reconnect):", err.message));
  return client;
}

let client = newClient();
await client.connect();

const { rows: batches } = await client.query(
  `select date::text as date, branch, count(*)::int row_count
   from raw_upload_rows where report_type = 'service_info'
   group by date, branch order by date, branch`,
);
console.log(`${batches.length} branch-day batches to replay (${batches.reduce((sum, b) => sum + b.row_count, 0)} rows total).`);

let batchesWithVisits = 0;
let totalVisitsLinked = 0;
let totalRowsMatched = 0;
let reconnects = 0;

async function withReconnect(fn) {
  const attempts = 5;
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) break;
      reconnects++;
      console.error(`  query failed (${error.message}), reconnecting (attempt ${attempt + 1}/${attempts})...`);
      await client.end().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 1_000 * (attempt + 1))); // backoff, gives a transient DNS/network blip time to clear
      try {
        client = newClient();
        await client.connect();
      } catch (reconnectError) {
        // Reconnect itself failed (e.g. DNS still down) — don't crash here,
        // the next loop iteration's fn() will fail fast and we'll retry again.
        console.error(`  reconnect attempt failed (${reconnectError.message}), will retry`);
      }
    }
  }
  throw lastError;
}

for (let i = 0; i < batches.length; i++) {
  const { date, branch } = batches[i];
  const rawRows = await withReconnect(async () => {
    const { rows } = await client.query(
      "select row_data from raw_upload_rows where report_type = 'service_info' and date = $1 and branch = $2 order by row_index",
      [date, branch],
    );
    return rows.map((r) => r.row_data);
  });
  const visits = extractServiceInfoVisits(rawRows, branch);
  if (!visits.length) continue;

  const rowsMatched = await withReconnect(async () => {
    await client.query("begin");
    try {
      const result = await client.query(LINK_SERVICE_INFO_VISITS_SQL, [JSON.stringify(toServiceInfoLinkRecords(visits))]);
      if (apply) await client.query("commit");
      else await client.query("rollback");
      return result.rowCount ?? 0;
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    }
  });
  batchesWithVisits++;
  totalVisitsLinked += visits.length;
  totalRowsMatched += rowsMatched;
  if ((i + 1) % 100 === 0) console.log(`  ...${i + 1}/${batches.length} batches processed`);
}

console.log(`\nBackfill ${apply ? "applied" : "dry run"}: ${batchesWithVisits} batches had visits, ${totalVisitsLinked} visit-records attempted, ${totalRowsMatched} ce_leads rows matched (regardless of whether their N-chain actually advanced), ${reconnects} reconnects.`);
if (!apply) console.log("No changes committed. Re-run with --apply after reviewing this.");

await client.end();
