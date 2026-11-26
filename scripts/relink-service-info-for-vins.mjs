import { extractServiceInfoVisits, LINK_SERVICE_INFO_VISITS_SQL, toServiceInfoLinkRecords } from "../src/lib/ce/service-info-visits.ts";

/**
 * Re-links a given set of ce_leads VINs against any Service Info (GS)
 * visit history already on file. Needed by every script that INSERTs
 * brand-new ce_leads rows (currently just import-uio-refresh.mjs): the
 * one-time backfill (2026-10-30, e6c1582) only covered VINs that already
 * existed in ce_leads at the time, so a VIN a later import adds for the
 * first time starts with whatever N date that import's own source
 * reports — which can already be stale next to a visit we uploaded
 * ourselves — and the live upload hook (service-info-link.ts) never gets
 * a chance to fix it unless that VIN gets a brand new visit afterward.
 * See project_mrs_n9_system.md (the 2026-11-03 Vivek-Babu-style gap).
 *
 * Processed per (date, branch) batch in chronological order — same shape
 * as backfill-service-info-ce-link.mjs's full replay — so a VIN with
 * several historical visits still builds its N/N1/N2 chain correctly,
 * not just its single latest visit. Callers run this inside the same
 * client/transaction as the insert that added these VINs, so a rollback
 * also rolls this back.
 */
export async function relinkServiceInfoForNewVins(client, vins) {
  if (!vins.length) return { batchesApplied: 0, visitsApplied: 0 };

  const { rows } = await client.query(
    `select branch, date::text as date, row_data
     from raw_upload_rows
     where report_type = 'service_info'
       and upper(trim(regexp_replace(row_data->>'Vin no', '^#', ''))) = any($1::text[])
     order by date, branch, row_index`,
    [vins],
  );

  const batches = new Map(); // "date|branch" -> rawRows[]
  for (const row of rows) {
    const key = `${row.date}|${row.branch}`;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(row.row_data);
  }

  let batchesApplied = 0;
  let visitsApplied = 0;
  for (const [key, rawRows] of [...batches.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const branch = key.slice(key.indexOf("|") + 1);
    const visits = extractServiceInfoVisits(rawRows, branch);
    if (!visits.length) continue;
    await client.query(LINK_SERVICE_INFO_VISITS_SQL, [JSON.stringify(toServiceInfoLinkRecords(visits))]);
    batchesApplied++;
    visitsApplied += visits.length;
  }
  return { batchesApplied, visitsApplied };
}
