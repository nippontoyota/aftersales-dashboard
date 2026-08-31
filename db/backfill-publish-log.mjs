// One-time backfill: mark every date that already has a BA Tool snapshot as
// published, so the new publish gate (2026-08-31) doesn't retroactively
// hide anything branch admins could already see. Safe to re-run — inserts
// only dates not already in dashboard_publish_log.
import { Client } from "pg";
import "../scripts/load-env.mjs";

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows } = await client.query("select distinct date::text as date from ba_tool_snapshots order by date");
  let inserted = 0;
  for (const { date } of rows) {
    const res = await client.query(
      `insert into dashboard_publish_log (date, published_at, published_by)
       values ($1, now(), 'backfill') on conflict (date) do nothing`,
      [date]
    );
    if (res.rowCount) inserted++;
  }
  console.log(`Backfilled ${inserted} of ${rows.length} dates as published.`);
} finally {
  await client.end();
}
