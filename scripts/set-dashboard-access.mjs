// NO LONGER USED FOR GATING (2026-08-29) — every admin account now gets
// dashboard access automatically (see src/lib/admin-store.ts's toAccount),
// locked to their own branch if they're not HQ (see dashboard-data.ts).
// This script still updates the dashboard_access column if you run it, but
// the app no longer reads that column for anything. Left in place in case
// the column itself is still wanted for some other reason later.
//
// Usage:
//   node scripts/set-dashboard-access.mjs --username co01b --allow
//   node scripts/set-dashboard-access.mjs --username co01b --deny
import { Client } from "pg";
import "./load-env.mjs";

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const username = getArg("username");
const allow = args.includes("--allow");
const deny = args.includes("--deny");

if (!username || allow === deny) {
  console.error("Usage: node scripts/set-dashboard-access.mjs --username <name> (--allow | --deny)");
  process.exit(1);
}

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows } = await client.query(
    `update admins set dashboard_access = $2 where username = $1 returning username, role, branch, dashboard_access`,
    [username, allow]
  );
  if (rows.length === 0) {
    console.error(`No admin found with username "${username}".`);
    process.exit(1);
  }
  const row = rows[0];
  if (row.role === "hq") {
    console.log(`${username} is an hq account — always has dashboard access regardless of this flag.`);
  } else {
    console.log(`${username} (${row.branch}) dashboard access: ${row.dashboard_access ? "granted" : "revoked"}`);
  }
} finally {
  await client.end();
}
