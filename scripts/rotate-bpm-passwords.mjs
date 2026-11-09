// Randomizes the password for every BP Manager (role = 'bp_manager') account.
// Run with `node scripts/rotate-bpm-passwords.mjs`.
// Uses simple 6-digit numeric PINs (easier to read out over phone/WhatsApp
// than the longer mixed-case passwords used for branch logins).
// Prints the new plaintext passwords once — they are not stored anywhere
// in plaintext, so copy them out before closing the terminal.
import { randomInt, randomBytes, scryptSync } from "node:crypto";
import { Client } from "pg";
import "./load-env.mjs";

function randomPin() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function hash(password, salt) {
  return scryptSync(password, salt, 64).toString("hex");
}

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows } = await client.query(
    `select username, branch from admins where role = 'bp_manager' order by branch`
  );

  const updates = rows.map((r) => {
    const password = randomPin();
    const salt = randomBytes(16).toString("hex");
    return { username: r.username, branch: r.branch, password, passwordHash: hash(password, salt), salt };
  });

  for (const u of updates) {
    await client.query(
      `update admins set password_hash = $1, salt = $2 where username = $3`,
      [u.passwordHash, u.salt, u.username]
    );
  }

  console.log(`Rotated ${updates.length} BP Manager passwords.\n`);
  console.log("branch".padEnd(8), "username".padEnd(10), "new password");
  for (const u of updates) {
    console.log(u.branch.padEnd(8), u.username.padEnd(10), u.password);
  }
} finally {
  await client.end();
}
