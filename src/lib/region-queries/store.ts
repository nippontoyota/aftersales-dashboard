import { pool } from "../db";
import type { RegionName } from "../regions";

/**
 * HQ ↔ Regional Manager query threads (table `region_queries`). Bidirectional,
 * unlike vp_flags (VP → HQ only): `direction: "to_hq"` is a regional manager
 * raising a question (mirrors vp_flags' shape — optional date/branch context
 * within their own region); `direction: "to_region"` is HQ raising one,
 * addressed to a specific region's manager. Same one-question/one-reply
 * lifecycle (open → answered → closed) as vp_flags, for consistency.
 */

export type RegionQueryDirection = "to_hq" | "to_region";
export type RegionQueryStatus = "open" | "answered" | "closed";

export type RegionQuery = {
  id: number;
  createdBy: string;
  createdAt: string;
  direction: RegionQueryDirection;
  region: RegionName;
  contextDate: string | null;
  contextBranch: string | null;
  note: string;
  status: RegionQueryStatus;
  reply: string | null;
  repliedBy: string | null;
  repliedAt: string | null;
};

type Row = {
  id: string;
  created_by: string;
  created_at: string;
  direction: RegionQueryDirection;
  region: RegionName;
  context_date: string | null;
  context_branch: string | null;
  note: string;
  status: RegionQueryStatus;
  reply: string | null;
  replied_by: string | null;
  replied_at: string | null;
};

function toQuery(r: Row): RegionQuery {
  return {
    id: Number(r.id),
    createdBy: r.created_by,
    createdAt: r.created_at,
    direction: r.direction,
    region: r.region,
    contextDate: r.context_date,
    contextBranch: r.context_branch,
    note: r.note,
    status: r.status,
    reply: r.reply,
    repliedBy: r.replied_by,
    repliedAt: r.replied_at,
  };
}

const COLUMNS = `id, created_by, created_at, direction, region, context_date::text as context_date,
  context_branch, note, status, reply, replied_by, replied_at`;

export async function createRegionQuery(input: {
  createdBy: string;
  direction: RegionQueryDirection;
  region: RegionName;
  contextDate: string | null;
  contextBranch: string | null;
  note: string;
}): Promise<void> {
  await pool.query(
    `insert into region_queries (created_by, direction, region, context_date, context_branch, note)
     values ($1, $2, $3, $4, $5, $6)`,
    [input.createdBy, input.direction, input.region, input.contextDate, input.contextBranch, input.note.slice(0, 4000)],
  );
}

/** Every thread, newest first — HQ's inbox. */
export async function listRegionQueries(): Promise<RegionQuery[]> {
  const { rows } = await pool.query<Row>(`select ${COLUMNS} from region_queries order by created_at desc`);
  return rows.map(toQuery);
}

/** One region's threads (both directions) — a regional manager's own inbox. */
export async function listRegionQueriesForRegion(region: RegionName): Promise<RegionQuery[]> {
  const { rows } = await pool.query<Row>(`select ${COLUMNS} from region_queries where region = $1 order by created_at desc`, [region]);
  return rows.map(toQuery);
}

export async function replyToRegionQuery(input: {
  id: number;
  repliedBy: string;
  reply: string;
  status: Extract<RegionQueryStatus, "answered" | "closed">;
}): Promise<void> {
  await pool.query(
    `update region_queries set reply = $2, replied_by = $3, replied_at = now(), status = $4 where id = $1`,
    [input.id, input.reply.slice(0, 4000), input.repliedBy, input.status],
  );
}

/** The asker (either side) closes their own thread once satisfied, or reopens it. */
export async function setRegionQueryStatus(id: number, status: RegionQueryStatus): Promise<void> {
  await pool.query(`update region_queries set status = $2 where id = $1`, [id, status]);
}

/**
 * HQ's notification count — threads where the ball is in HQ's court: a
 * regional manager asked and it's still open (awaiting HQ's reply), or HQ
 * asked and the manager has replied (awaiting HQ reading/closing it).
 */
export async function countActionableForHq(): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `select count(*)::text as n from region_queries
      where (direction = 'to_hq' and status = 'open')
         or (direction = 'to_region' and status = 'answered')`,
  );
  return Number(rows[0]?.n ?? 0);
}

/** A regional manager's notification count — the mirror image of countActionableForHq, scoped to their region. */
export async function countActionableForRegion(region: RegionName): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `select count(*)::text as n from region_queries
      where region = $1
        and ((direction = 'to_region' and status = 'open')
         or  (direction = 'to_hq' and status = 'answered'))`,
    [region],
  );
  return Number(rows[0]?.n ?? 0);
}
