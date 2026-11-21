import type { PoolClient } from "pg";
import { pool } from "../db";
import { loadPartSaleDatesForRos } from "../raw-upload-rows/store";
import { normalizeRo } from "../close-sa-analytics/compute";

export type PendingRecompute = { branch: string; date: string };

/** Marks one (branch, date) pair as needing its analytics recomputed —
 * see schema.sql's doc comment on pending_recomputes for why uploads mark
 * this instead of recomputing inline. Idempotent: a pair already pending
 * just stays pending. */
export async function markPendingRecompute(branch: string, date: string, client?: PoolClient): Promise<void> {
  const qc = client ?? pool;
  await qc.query(`insert into pending_recomputes (branch, date) values ($1, $2) on conflict (branch, date) do nothing`, [branch, date]);
}

/** Bulk variant — one round trip for several pairs at once. */
export async function markPendingRecomputes(pairs: PendingRecompute[], client?: PoolClient): Promise<void> {
  if (pairs.length === 0) return;
  const qc = client ?? pool;
  await qc.query(
    `insert into pending_recomputes (branch, date)
     select * from unnest($1::text[], $2::date[])
     on conflict (branch, date) do nothing`,
    [pairs.map((p) => p.branch), pairs.map((p) => p.date)]
  );
}

/** Finds which OTHER Part Sale dates now need re-recomputing because an RO
 * in this upload just closed (parts can be issued before a job closes, so
 * an earlier Part Sale date's recompute can only pick up its Close SA once
 * the RO it belongs to finally closes here — see recompute.ts's original
 * catchUpPartSaleForClosedRos, which this mirrors but marks pending
 * instead of recomputing immediately). Excludes `justUploadedDate` since
 * that pair is always marked separately by the caller. */
export async function markCatchUpPartSaleDatesPending(branch: string, ros: unknown[], justUploadedDate: string): Promise<void> {
  try {
    const normalizedRos = [...new Set(ros.map(normalizeRo).filter(Boolean))];
    if (normalizedRos.length === 0) return;
    const dates = (await loadPartSaleDatesForRos(branch, normalizedRos)).filter((date) => date !== justUploadedDate);
    await markPendingRecomputes(dates.map((date) => ({ branch, date })));
  } catch (err) {
    console.error(`markCatchUpPartSaleDatesPending failed for ${branch}:`, err);
  }
}

export async function loadAllPendingRecomputes(): Promise<PendingRecompute[]> {
  const { rows } = await pool.query(`select branch, date::text from pending_recomputes order by branch, date`);
  return rows;
}

export async function countPendingRecomputes(): Promise<number> {
  const { rows } = await pool.query(`select count(*)::int as n from pending_recomputes`);
  return rows[0].n;
}

export async function clearPendingRecompute(branch: string, date: string): Promise<void> {
  await pool.query(`delete from pending_recomputes where branch = $1 and date = $2`, [branch, date]);
}
