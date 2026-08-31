import { pool } from "./db";

/**
 * dashboard_publish_log — one row per published date (see db/schema.sql).
 * HQ is never gated by this; it only controls what a branch admin can see
 * (2026-08-31). Backfilled once via db/backfill-publish-log.mjs so every
 * date that existed before this feature stays visible.
 */
export async function isDatePublished(date: string): Promise<boolean> {
  const { rows } = await pool.query("select 1 from dashboard_publish_log where date = $1", [date]);
  return rows.length > 0;
}

/** All published dates, ascending — what a branch admin's date picker is limited to. */
export async function listPublishedDates(): Promise<string[]> {
  const { rows } = await pool.query<{ date: string }>("select date::text as date from dashboard_publish_log order by date");
  return rows.map((r) => r.date);
}

/** The most recent published date, if any — what a branch admin falls back to when today's isn't out yet. */
export async function getLatestPublishedDate(): Promise<string | null> {
  const { rows } = await pool.query<{ date: string }>("select date::text as date from dashboard_publish_log order by date desc limit 1");
  return rows[0]?.date ?? null;
}

export async function publishDate(date: string, publishedBy: string): Promise<void> {
  await pool.query(
    `insert into dashboard_publish_log (date, published_at, published_by)
     values ($1, now(), $2)
     on conflict (date) do update set published_at = excluded.published_at, published_by = excluded.published_by`,
    [date, publishedBy]
  );
}
