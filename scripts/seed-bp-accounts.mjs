// Seeds the 18 BP Manager accounts (one per branch) + the single BP HO
// account for the BP Referrals workflow — run with:
//   node scripts/seed-bp-accounts.mjs
// Idempotent/upsert by username, same as seed-admins.mjs, but scoped only to
// these bp_manager/bp_ho accounts — never touches any other existing admin
// account (hq, branch, regional, etc.).
import { randomBytes, scryptSync } from "node:crypto";
import { Client } from "pg";
import "./load-env.mjs";

// Same 18-branch list as listBranchCodes() in admin-store.ts (every branch
// with its own admin, minus CO01C the online store and CO01D deactivated).
const REGIONS = {
  Central: ["CO01A", "CO01B", "CO01E", "MV01A", "KY01A"],
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

for (const branch of BRANCHES) {
  const username = `bpm${branch.toLowerCase()}`;
  const password = `BPM${branch}@2026`;
  accounts.push(makeAccount(username, password, "bp_manager", branch));
  credentials.push({ username, password, role: `bp_manager (${branch})` });
}

accounts.push(makeAccount("bpho", "BPHO@2026", "bp_ho"));
credentials.push({ username: "bpho", password: "BPHO@2026", role: "bp_ho" });

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
      [a.username, a.passwordHash, a.salt, a.role, a.branch],
    );
  }
  console.log(`Upserted ${accounts.length} BP accounts into Postgres.\n`);
  console.log("username".padEnd(14), "password".padEnd(20), "role");
  for (const c of credentials) {
    console.log(c.username.padEnd(14), c.password.padEnd(20), c.role);
  }
} finally {
  await client.end();
}
