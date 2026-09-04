// Adds (or resets the password of) a single admin account — the way to give
// a branch a second, third, etc. login now that multiple admins per branch
// are supported (each with full access to that branch's report types), or to
// create a read-only regional manager.
//
// Usage:
//   node scripts/add-admin.mjs --username co01b2 --branch CO01B --password "Something@2026"
//   node scripts/add-admin.mjs --username admin2 --hq --password "Something@2026"
//   node scripts/add-admin.mjs --username rm-north --region North --password "Something@2026"
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
const region = getArg("region");
const password = getArg("password");
const isHq = args.includes("--hq");

const VALID_REGIONS = ["North", "Central", "South"];

if (!username || !password || (!branch && !isHq && !region)) {
  console.error(
    "Usage: node scripts/add-admin.mjs --username <name> --password <pass> (--branch <BRANCH> | --hq | --region <North|Central|South>)",
  );
  process.exit(1);
}
if (region && !VALID_REGIONS.includes(region)) {
  console.error(`--region must be one of: ${VALID_REGIONS.join(", ")}`);
  process.exit(1);
}

function hash(pw, salt) {
  return scryptSync(pw, salt, 64).toString("hex");
}

const salt = randomBytes(16).toString("hex");
const passwordHash = hash(password, salt);
const role = isHq ? "hq" : region ? "regional" : "branch";

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(
    `insert into admins (username, password_hash, salt, role, branch, region)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (username) do update set
       password_hash = excluded.password_hash,
       salt = excluded.salt,
       role = excluded.role,
       branch = excluded.branch,
       region = excluded.region`,
    [username, passwordHash, salt, role, role === "branch" ? branch : null, role === "regional" ? region : null],
  );
  const scope = role === "branch" ? `, ${branch}` : role === "regional" ? `, ${region}` : "";
  console.log(`Account ready: ${username}  (${role}${scope})  password: ${password}`);
} finally {
  await client.end();
}
