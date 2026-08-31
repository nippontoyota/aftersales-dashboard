// Seeds/updates the `admins` table in Postgres — run with `node scripts/seed-admins.mjs`.
// Re-running upserts by username: existing accounts get their password reset
// to the values below, new branches get created. Idempotent, safe to re-run.
import { randomBytes, scryptSync } from "node:crypto";
import { Client } from "pg";
import "./load-env.mjs";

const REGIONS = {
  Central: ["CO01A", "CO01B", "CO01C", "CO01D", "CO01E", "MV01A", "KY01A"],
  South: ["TR01A", "TR01B", "TR01C", "KL01A", "KL01B", "PH01A"],
  North: ["TL01A", "KT01A", "KT01B", "TI01A", "IR01A", "TI01B", "TI01C"],
};
const BRANCHES = Object.values(REGIONS).flat();

function hash(password, salt) {
  return scryptSync(password, salt, 64).toString("hex");
}

function makeAccount(username, password, role, branch) {
  const salt = randomBytes(16).toString("hex");
  return { username, passwordHash: hash(password, salt), salt, role, branch: branch ?? null };
}

const credentials = [];
const accounts = [];

accounts.push(makeAccount("admin", "NipponAdmin@2026", "hq"));
credentials.push({ username: "admin", password: "NipponAdmin@2026", role: "hq" });

for (const branch of BRANCHES) {
  const username = branch.toLowerCase();
  const password = `${branch}@2026`;
  accounts.push(makeAccount(username, password, "branch", branch));
  credentials.push({ username, password, role: `branch (${branch})` });
}

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  for (const a of accounts) {
    await client.query(
      `insert into admins (username, password_hash, salt, role, branch)
       values ($1, $2, $3, $4, $5)
       on conflict (username) do update set
         password_hash = excluded.password_hash,
         salt = excluded.salt,
         role = excluded.role,
         branch = excluded.branch`,
      [a.username, a.passwordHash, a.salt, a.role, a.branch]
    );
  }
  console.log(`Upserted ${accounts.length} accounts into Postgres.\n`);
  console.log("username".padEnd(10), "password".padEnd(16), "role");
  for (const c of credentials) {
    console.log(c.username.padEnd(10), c.password.padEnd(16), c.role);
  }
} finally {
  await client.end();
}
