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
  | { username: string; passwordHash: string; salt: string; role: "regional"; region: RegionName; canViewDashboard: true }
  // Read-only VP Service — its own executive view at /vp: company-wide
  // always, no branch/region/publish gate, no uploads, no HQ tools. Can
  // raise query flags to HQ (see vp-flags/store.ts).
  | { username: string; passwordHash: string; salt: string; role: "vp_service"; canViewDashboard: true }
  // Read-only CEO — its own executive view at /ceo, same shape as
  // vp_service (company-wide, no branch/region/publish gate, no uploads).
  | { username: string; passwordHash: string; salt: string; role: "ceo"; canViewDashboard: true }
  // Read-only Accounts — its own finance-only executive view at /accounts,
  // same shape again (company-wide, no branch/region/publish gate, no uploads).
  | { username: string; passwordHash: string; salt: string; role: "accounts"; canViewDashboard: true }
  // Read-only HQ viewer — sees every HQ dashboard page (Dashboard, TKM Targets,
  // Queries, Branch Performance, Reports, Cancellations) but has no upload
  // surface, no publish control, and no write actions on any page.
  | { username: string; passwordHash: string; salt: string; role: "hq_viewer"; canViewDashboard: true }
  // BP (Body & Paint) Manager — scoped to one branch, works that branch's
  // referral call/validation queue at /bp-referrals. No uploads, no company
  // dashboard. CO01A/KL01B/TI01A additionally get a read-only region-wide
  // rollup, computed in code from REGIONS (see regions.ts) — not stored
  // here, so this shape is identical for every bp_manager account.
  | { username: string; passwordHash: string; salt: string; role: "bp_manager"; branch: string; canViewDashboard: true }
  // BP HO — read-only, company-wide analytical view across all branches'
  // referrals, same shape as vp_service/ceo/accounts (no branch/region/
  // publish gate, no uploads).
  | { username: string; passwordHash: string; salt: string; role: "bp_ho"; canViewDashboard: true }
  // Company-wide Customer Engagement workspace. It has no access to the
  // operational dashboards and no branch/region scope.
  | { username: string; passwordHash: string; salt: string; role: "ce"; canViewDashboard: false }
  // Read-only, scoped to just KL01A + KL01B (see kl-branches-data.ts) — one
  // account for a single overseer (Biju S Pillai) who needs both branches
  // but not the whole South region. Never uploads, never sets targets, no
  // Queries access. Same shape as vp_service/ceo/accounts (no branch/region
  // column — the two branches are hardcoded in code, not stored per-admin).
  | { username: string; passwordHash: string; salt: string; role: "kl_cluster"; canViewDashboard: true };

type AdminRow = {
  username: string;
  password_hash: string;
  salt: string;
  role: "hq" | "branch" | "regional" | "vp_service" | "ceo" | "accounts" | "hq_viewer" | "bp_manager" | "bp_ho" | "ce" | "kl_cluster";
  branch: string | null;
  region: string | null;
};

function toAccount(row: AdminRow): AdminAccount {
  const base = { username: row.username, passwordHash: row.password_hash, salt: row.salt, canViewDashboard: true } as const;
  if (row.role === "branch") return { ...base, role: "branch", branch: row.branch! };
  if (row.role === "regional") return { ...base, role: "regional", region: row.region as RegionName };
  if (row.role === "vp_service") return { ...base, role: "vp_service" };
  if (row.role === "ceo") return { ...base, role: "ceo" };
  if (row.role === "accounts") return { ...base, role: "accounts" };
  if (row.role === "hq_viewer") return { ...base, role: "hq_viewer" };
  if (row.role === "bp_manager") return { ...base, role: "bp_manager", branch: row.branch! };
  if (row.role === "bp_ho") return { ...base, role: "bp_ho" };
  if (row.role === "ce") return { ...base, role: "ce", canViewDashboard: false };
  if (row.role === "kl_cluster") return { ...base, role: "kl_cluster" };
  if (row.role === "hq") return { ...base, role: "hq" };
  throw new Error(`Unsupported admin role: ${String(row.role)}`);
}

/** Human label for the sidebar's account area, e.g. "HQ admin", "CO01B
 * branch", "North regional manager". */
export function adminIdentityLabel(admin: AdminAccount): string {
  if (admin.role === "hq") return "HQ admin";
  if (admin.role === "hq_viewer") return "HQ viewer";
  if (admin.role === "regional") return `${admin.region} regional manager`;
  if (admin.role === "vp_service") return "VP Service";
  if (admin.role === "ceo") return "CEO";
  if (admin.role === "accounts") return "Accounts";
  if (admin.role === "bp_ho") return "BP HO";
  if (admin.role === "ce") return "Customer Engagement";
  if (admin.role === "kl_cluster") return "KL01A / KL01B overseer";
  if (admin.role === "bp_manager") return `${admin.branch} BP Manager`;
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
