import "./load-env.mjs";
import { Pool } from "pg";

/** One-off cleanup (2026-11-13, at the user's request), second round: after
 * removing Kannur/Kozhikode, also soft-delete every remaining conquest lead
 * whose address matches a district with no Nippon Toyota branch — real
 * branch list from src/lib/branch-names.ts, not guessed. Keeps the 7
 * branch-district matches AND the leads whose address didn't clearly match
 * any district at all (explicitly told to keep those, unlike the previous
 * round's approach). Same active=false soft delete as before — reversible.
 *
 * Usage: node scripts/deactivate-conquest-nonbranch-districts.mjs [--apply]
 */

const REMOVE_DISTRICTS = ["Idukki", "Palakkad", "Malappuram", "Wayanad", "Kasaragod"];

const apply = process.argv.includes("--apply");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true, ca: process.env.DATABASE_CA_CERT } });
const client = await pool.connect();
try {
  await client.query("begin");

  const clause = REMOVE_DISTRICTS.map((_, i) => `address ilike $${i + 1}`).join(" or ");
  const params = REMOVE_DISTRICTS.map((d) => `%${d}%`);

  const before = await client.query("select count(*)::int c from ce_conquest_leads where active");
  const toRemove = await client.query(`select count(*)::int c from ce_conquest_leads where active and (${clause})`, params);

  const result = await client.query(`update ce_conquest_leads set active = false where active and (${clause})`, params);

  const after = await client.query("select count(*)::int c from ce_conquest_leads where active");

  if (apply) await client.query("commit");
  else await client.query("rollback");

  console.log({
    apply,
    activeBefore: before.rows[0].c,
    matchedNonBranchDistrict: toRemove.rows[0].c,
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
