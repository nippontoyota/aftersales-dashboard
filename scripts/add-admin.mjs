// Adds (or resets the password of) a single admin account — the way to give
// a branch a second, third, etc. login now that multiple admins per branch
// are supported (each with full access to that branch's report types).
//
// Usage:
//   node scripts/add-admin.mjs --username co01b2 --branch CO01B --password "Something@2026"
//   node scripts/add-admin.mjs --username admin2 --hq --password "Something@2026"
import { randomBytes, scryptSync } from "node:crypto";
import { Client } from "pg";
import "./load-env.mjs";

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const username = getArg("username");
const branch = getArg("branch");
const password = getArg("password");
const isHq = args.includes("--hq");

if (!username || !password || (!branch && !isHq)) {
  console.error("Usage: node scripts/add-admin.mjs --username <name> --password <pass> (--branch <BRANCH> | --hq)");
  process.exit(1);
}

function hash(pw, salt) {
  return scryptSync(pw, salt, 64).toString("hex");
}

const salt = randomBytes(16).toString("hex");
const passwordHash = hash(password, salt);
const role = isHq ? "hq" : "branch";

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(
    `insert into admins (username, password_hash, salt, role, branch)
     values ($1, $2, $3, $4, $5)
     on conflict (username) do update set
       password_hash = excluded.password_hash,
       salt = excluded.salt,
       role = excluded.role,
       branch = excluded.branch`,
    [username, passwordHash, salt, role, isHq ? null : branch]
  );
  console.log(`Account ready: ${username}  (${role}${branch ? `, ${branch}` : ""})  password: ${password}`);
} finally {
  await client.end();
}
