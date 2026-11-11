import "./load-env.mjs";
import { Pool } from "pg";

/** One-off cleanup (2026-11-11, at the user's request): Kannur and
 * Kozhikode district conquest leads are out of this dealer group's
 * reasonable reach, so they're soft-deleted (active = false) rather than
 * surfaced in /ce/conquest's call list — same active flag ce_leads already
 * uses for archiving, so this is reversible (just flip it back) rather than
 * a hard delete. Matches district by a case-insensitive substring check
 * against the address text, not the "DISTRICT:" field alone — that field is
 * blank/inconsistently formatted for about half these rows (several
 * different source files' address conventions), while the district name
 * itself reliably appears somewhere in the free-text address regardless of
 * format.
 *
 * Usage: node scripts/deactivate-conquest-districts.mjs [--apply]
 */

const apply = process.argv.includes("--apply");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true, ca: process.env.DATABASE_CA_CERT } });
const client = await pool.connect();
try {
  await client.query("begin");

  const before = await client.query("select count(*)::int c from ce_conquest_leads where active");
  const toRemove = await client.query(
    `select count(*)::int c from ce_conquest_leads
     where active and (address ilike '%Kannur%' or address ilike '%Kozhikode%')`,
  );

  const result = await client.query(
    `update ce_conquest_leads set active = false
     where active and (address ilike '%Kannur%' or address ilike '%Kozhikode%')`,
  );

  const after = await client.query("select count(*)::int c from ce_conquest_leads where active");

  if (apply) await client.query("commit");
  else await client.query("rollback");

  console.log({
    apply,
    activeBefore: before.rows[0].c,
    matchedKannurOrKozhikode: toRemove.rows[0].c,
    rowsUpdated: result.rowCount,
    activeAfter: apply ? after.rows[0].c : before.rows[0].c,
  });
  if (!apply) console.log("Dry run only — nothing committed. Re-run with --apply to actually soft-delete these rows.");
} catch (error) {
  await client.query("rollback").catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}
