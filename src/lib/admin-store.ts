import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { pool } from "./db";
import type { RegionName } from "./regions";

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
  | { username: string; passwordHash: string; salt: string; role: "branch"; branch: string; canViewDashboard: true }
  // Read-only regional manager — scoped to `region` before HQ publishes,
  // full company dashboard after. Never uploads (see upload/page.tsx etc.).
  | { username: string; passwordHash: string; salt: string; role: "regional"; region: RegionName; canViewDashboard: true };

type AdminRow = {
  username: string;
  password_hash: string;
  salt: string;
  role: "hq" | "branch" | "regional";
  branch: string | null;
  region: string | null;
};

function toAccount(row: AdminRow): AdminAccount {
  const base = { username: row.username, passwordHash: row.password_hash, salt: row.salt, canViewDashboard: true } as const;
  if (row.role === "branch") return { ...base, role: "branch", branch: row.branch! };
  if (row.role === "regional") return { ...base, role: "regional", region: row.region as RegionName };
  return { ...base, role: "hq" };
}

/** Human label for the sidebar's account area, e.g. "HQ admin", "CO01B
 * branch", "North regional manager". */
export function adminIdentityLabel(admin: AdminAccount): string {
  if (admin.role === "hq") return "HQ admin";
  if (admin.role === "regional") return `${admin.region} regional manager`;
  return `${admin.branch} branch`;
}

export function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

export function newSalt(): string {
  return randomBytes(16).toString("hex");
}

export async function findAdmin(username: string): Promise<AdminAccount | null> {
  const { rows } = await pool.query<AdminRow>(
    "select username, password_hash, salt, role, branch, region from admins where username = $1",
    [username],
  );
  return rows[0] ? toAccount(rows[0]) : null;
}

/** Every branch code with its own admin account — the real source of truth
 * for "which branches exist," used by the HQ-only proxy upload (/upload-sheet)
 * to populate its branch picker and to seed filename-matching candidates. */
export async function listBranchCodes(): Promise<string[]> {
  const { rows } = await pool.query<{ branch: string }>("select distinct branch from admins where role = 'branch' order by branch");
  // CO01C is an online store (no uploads), CO01D is deactivated
  return rows.map((r) => r.branch).filter((b) => b !== "CO01C" && b !== "CO01D");
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
