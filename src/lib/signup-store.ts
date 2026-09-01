import { pool } from "./db";
import { hashPassword, newSalt } from "./admin-store";

/**
 * Self-service branch-admin signup requests (see db/schema.sql). A request
 * sits as 'pending' until HQ approves or rejects it — approving is the only
 * path that ever creates a real row in `admins`; rejecting (or just leaving
 * it pending) means the username never works, indistinguishable from a
 * username that was never requested at all (checkCredentials only ever
 * looks at `admins`, never at this table).
 */
export type SignupRequestStatus = "pending" | "approved" | "rejected";

export type SignupRequest = {
  id: number;
  name: string;
  username: string;
  branch: string;
  status: SignupRequestStatus;
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
};

type SignupRequestRow = {
  id: number;
  name: string;
  username: string;
  branch: string;
  status: SignupRequestStatus;
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
};

function toRequest(row: SignupRequestRow): SignupRequest {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    branch: row.branch,
    status: row.status,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
  };
}

const LIST_COLUMNS = "id, name, username, branch, status, requested_at, decided_at, decided_by";

export type CreateSignupRequestResult = { ok: true } | { ok: false; error: string };

/** Validates uniqueness against both real accounts and any other still-pending
 * request before inserting — a username can be re-requested after a
 * rejection (the old rejected row just stays as history), but never while
 * an approved account or another pending request already holds it. */
export async function createSignupRequest(params: {
  name: string;
  username: string;
  password: string;
  branch: string;
}): Promise<CreateSignupRequestResult> {
  const { name, username, password, branch } = params;

  const { rows: existingAdmin } = await pool.query("select 1 from admins where username = $1", [username]);
  if (existingAdmin.length > 0) {
    return { ok: false, error: "That username is already in use — choose another." };
  }

  const { rows: existingPending } = await pool.query(
    "select 1 from admin_signup_requests where username = $1 and status = 'pending'",
    [username]
  );
  if (existingPending.length > 0) {
    return { ok: false, error: "A request for that username is already pending HQ approval." };
  }

  const salt = newSalt();
  const passwordHash = hashPassword(password, salt);
  await pool.query(
    `insert into admin_signup_requests (name, username, password_hash, salt, branch)
     values ($1, $2, $3, $4, $5)`,
    [name, username, passwordHash, salt, branch]
  );
  return { ok: true };
}

export async function listPendingSignupRequests(): Promise<SignupRequest[]> {
  const { rows } = await pool.query<SignupRequestRow>(
    `select ${LIST_COLUMNS} from admin_signup_requests where status = 'pending' order by requested_at`
  );
  return rows.map(toRequest);
}

/** Most-recently-decided requests, for HQ's own record of who approved/rejected what — not needed for any access-control decision. */
export async function listDecidedSignupRequests(limit = 20): Promise<SignupRequest[]> {
  const { rows } = await pool.query<SignupRequestRow>(
    `select ${LIST_COLUMNS} from admin_signup_requests where status != 'pending' order by decided_at desc limit $1`,
    [limit]
  );
  return rows.map(toRequest);
}

export type DecideSignupRequestResult = { ok: true } | { ok: false; error: string };

/** Approves a pending request — inserts the real `admins` row (reusing the
 * hash+salt collected at signup, never re-touching the password) and marks
 * the request decided, inside one transaction so a failure on either side
 * leaves neither half applied. */
export async function approveSignupRequest(id: number, decidedBy: string): Promise<DecideSignupRequestResult> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query(
      "select name, username, password_hash, salt, branch, status from admin_signup_requests where id = $1 for update",
      [id]
    );
    const request = rows[0];
    if (!request) {
      await client.query("rollback");
      return { ok: false, error: "Request not found." };
    }
    if (request.status !== "pending") {
      await client.query("rollback");
      return { ok: false, error: `This request was already ${request.status}.` };
    }

    const { rows: existingAdmin } = await client.query("select 1 from admins where username = $1", [request.username]);
    if (existingAdmin.length > 0) {
      await client.query("rollback");
      return { ok: false, error: `Username "${request.username}" is already in use — can't approve.` };
    }

    await client.query(
      `insert into admins (username, password_hash, salt, role, branch, dashboard_access)
       values ($1, $2, $3, 'branch', $4, true)`,
      [request.username, request.password_hash, request.salt, request.branch]
    );
    await client.query(
      "update admin_signup_requests set status = 'approved', decided_at = now(), decided_by = $2 where id = $1",
      [id, decidedBy]
    );
    await client.query("commit");
    return { ok: true };
  } catch (err) {
    await client.query("rollback");
    return { ok: false, error: err instanceof Error ? err.message : "Could not approve this request." };
  } finally {
    client.release();
  }
}

export async function rejectSignupRequest(id: number, decidedBy: string): Promise<DecideSignupRequestResult> {
  const { rows } = await pool.query(
    "update admin_signup_requests set status = 'rejected', decided_at = now(), decided_by = $2 where id = $1 and status = 'pending' returning id",
    [id, decidedBy]
  );
  if (rows.length === 0) {
    return { ok: false, error: "Request not found or already decided." };
  }
  return { ok: true };
}
