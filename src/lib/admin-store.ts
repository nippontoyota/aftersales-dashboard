import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { pool } from "./db";

/**
 * Admin accounts — Postgres-backed (see db/schema.sql). An "hq" account
 * uploads the company-wide BA Tool file; a "branch" account (any number per
 * branch, see scripts/add-admin.mjs) uploads that branch's Service Info
 * Report / Part Sale Report / SSRV089 / scom205 — branch identity comes
 * from who's logged in, never from a form field or the file itself.
 * Passwords are salted + scrypt-hashed, seeded by scripts/seed-admins.mjs.
 *
 * `canViewDashboard` gates the /dashboard page family (see dashboard/page.tsx
 * and app-shell.tsx) — every branch admin can still upload regardless of
 * this flag, it only controls who can see the dashboard itself. Every
 * account now gets it automatically (2026-08-29: was previously opt-in per
 * branch via scripts/set-dashboard-access.mjs — the user asked for every
 * branch to be able to check their own numbers, not a manually-granted
 * few). What a branch admin actually *sees* once inside is locked to their
 * own branch — see dashboard-data.ts's `loadDashboardData`, which is the
 * real enforcement point, not just something the UI hides. The
 * `dashboard_access` column still exists but is no longer read for gating.
 */
export type AdminAccount =
  | { username: string; passwordHash: string; salt: string; role: "hq"; canViewDashboard: true }
  | { username: string; passwordHash: string; salt: string; role: "branch"; branch: string; canViewDashboard: true };

type AdminRow = {
  username: string;
  password_hash: string;
  salt: string;
  role: "hq" | "branch";
  branch: string | null;
};

function toAccount(row: AdminRow): AdminAccount {
  if (row.role === "branch") {
    return {
      username: row.username,
      passwordHash: row.password_hash,
      salt: row.salt,
      role: "branch",
      branch: row.branch!,
      canViewDashboard: true,
    };
  }
  return { username: row.username, passwordHash: row.password_hash, salt: row.salt, role: "hq", canViewDashboard: true };
}

export function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

export function newSalt(): string {
  return randomBytes(16).toString("hex");
}

export async function findAdmin(username: string): Promise<AdminAccount | null> {
  const { rows } = await pool.query<AdminRow>("select username, password_hash, salt, role, branch from admins where username = $1", [
    username,
  ]);
  return rows[0] ? toAccount(rows[0]) : null;
}

/** Every branch code with its own admin account — the real source of truth
 * for "which branches exist," used by the HQ-only proxy upload (/upload-sheet)
 * to populate its branch picker and to seed filename-matching candidates. */
export async function listBranchCodes(): Promise<string[]> {
  const { rows } = await pool.query<{ branch: string }>("select distinct branch from admins where role = 'branch' order by branch");
  return rows.map((r) => r.branch);
}

export async function verifyAdminPassword(username: string, password: string): Promise<AdminAccount | null> {
  const admin = await findAdmin(username);
  if (!admin) return null;

  const hash = hashPassword(password, admin.salt);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(admin.passwordHash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return admin;
}
