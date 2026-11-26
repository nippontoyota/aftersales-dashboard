// Randomizes the password for every branch-role account in `admins`.
// Run with `node scripts/rotate-branch-passwords.mjs`.
// Prints the new plaintext passwords once — they are not stored anywhere
// in plaintext, so copy them out before closing the terminal.
import { randomBytes, scryptSync } from "node:crypto";
import { Client } from "pg";
import "./load-env.mjs";

const CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"; // no 0/O/1/l/I

function randomPassword(length = 10) {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CHARSET[bytes[i] % CHARSET.length];
  }
  return out;
}

function hash(password, salt) {
  return scryptSync(password, salt, 64).toString("hex");
}

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows } = await client.query(
    `select username, branch from admins where role = 'branch' order by branch`
  );

  const updates = rows.map((r) => {
    const password = randomPassword();
    const salt = randomBytes(16).toString("hex");
    return { username: r.username, branch: r.branch, password, passwordHash: hash(password, salt), salt };
  });

  for (const u of updates) {
    await client.query(
      `update admins set password_hash = $1, salt = $2 where username = $3`,
      [u.passwordHash, u.salt, u.username]
    );
  }

  console.log(`Rotated ${updates.length} branch passwords.\n`);
  console.log("branch".padEnd(8), "username".padEnd(10), "new password");
  for (const u of updates) {
    console.log(u.branch.padEnd(8), u.username.padEnd(10), u.password);
  }
} finally {
  await client.end();
}
