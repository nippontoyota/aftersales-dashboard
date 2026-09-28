import { pool } from "../db";
import type { RegionName } from "../regions";
import type { VpQueryRecipientType } from "./recipient-label";

export { recipientLabel } from "./recipient-label";

/**
 * VP query threads (table `vp_query_threads` + `vp_query_recipients`) —
 * the VP raises a question against whatever they were looking at (a page, a
 * date, and optionally a region/branch/metric/the figure as displayed),
 * addressed to any combination of HQ, one or more regional managers, and
 * one or more branch admins (2026-09-26, replacing the old VP→HQ-only
 * model). Each recipient gets their own row and replies independently — a
 * thread with three recipients can end up with three different replies, all
 * visible to the VP under the one question. The VP archives a thread once
 * they've seen enough; that's independent of whether every recipient has
 * replied.
 */

export type VpQueryPage = "overview" | "region" | "branch";
export type { VpQueryRecipientType } from "./recipient-label";
export type VpQueryRecipientStatus = "open" | "answered";

/** What the VP picked when raising a query — enough to insert one recipient row. */
export type VpQueryRecipientInput =
  | { type: "hq" }
  | { type: "regional"; region: RegionName }
  | { type: "branch"; branch: string };

export type VpQueryRecipient = {
  id: number;
  threadId: number;
  type: VpQueryRecipientType;
  region: RegionName | null;
  branch: string | null;
  status: VpQueryRecipientStatus;
  reply: string | null;
  repliedBy: string | null;
  repliedAt: string | null;
};

export type VpQueryThread = {
  id: number;
  createdBy: string;
  createdAt: string;
  page: VpQueryPage;
  date: string | null;
  region: string | null;
  branch: string | null;
  metric: string | null;
  value: string | null;
  note: string;
  archived: boolean;
  recipients: VpQueryRecipient[];
};

type ThreadRow = {
  id: string;
  created_by: string;
  created_at: string;
  context_page: VpQueryPage;
  context_date: string | null;
  context_region: string | null;
  context_branch: string | null;
  context_metric: string | null;
  context_value: string | null;
  note: string;
  archived: boolean;
};

type RecipientRow = {
  id: string;
  thread_id: string;
  recipient_type: VpQueryRecipientType;
  recipient_region: RegionName | null;
  recipient_branch: string | null;
  status: VpQueryRecipientStatus;
  reply: string | null;
  replied_by: string | null;
  replied_at: string | null;
};

function toRecipient(r: RecipientRow): VpQueryRecipient {
  return {
    id: Number(r.id),
    threadId: Number(r.thread_id),
    type: r.recipient_type,
    region: r.recipient_region,
    branch: r.recipient_branch,
    status: r.status,
    reply: r.reply,
    repliedBy: r.replied_by,
    repliedAt: r.replied_at,
  };
}

const THREAD_COLUMNS = `id, created_by, created_at, context_page, context_date::text as context_date,
  context_region, context_branch, context_metric, context_value, note, archived`;
const RECIPIENT_COLUMNS = `id, thread_id, recipient_type, recipient_region, recipient_branch, status, reply, replied_by, replied_at`;

function assembleThreads(threadRows: ThreadRow[], recipientRows: RecipientRow[]): VpQueryThread[] {
  const recipientsByThread = new Map<number, VpQueryRecipient[]>();
  for (const row of recipientRows) {
    const recipient = toRecipient(row);
    const list = recipientsByThread.get(recipient.threadId) ?? [];
    list.push(recipient);
    recipientsByThread.set(recipient.threadId, list);
  }
  return threadRows.map((r) => ({
    id: Number(r.id),
    createdBy: r.created_by,
    createdAt: r.created_at,
    page: r.context_page,
    date: r.context_date,
    region: r.context_region,
    branch: r.context_branch,
    metric: r.context_metric,
    value: r.context_value,
    note: r.note,
    archived: r.archived,
    recipients: recipientsByThread.get(Number(r.id)) ?? [],
  }));
}

async function threadsByCondition(where: string, params: unknown[]): Promise<VpQueryThread[]> {
  const { rows: threadRows } = await pool.query<ThreadRow>(
    `select ${THREAD_COLUMNS} from vp_query_threads where ${where} order by created_at desc`,
    params
  );
  if (threadRows.length === 0) return [];
  const ids = threadRows.map((r) => Number(r.id));
  const { rows: recipientRows } = await pool.query<RecipientRow>(
    `select ${RECIPIENT_COLUMNS} from vp_query_recipients where thread_id = any($1::bigint[])`,
    [ids]
  );
  return assembleThreads(threadRows, recipientRows);
}

/** VP raises a query, addressed to one or more recipients. */
export async function createVpQuery(input: {
  createdBy: string;
  page: VpQueryPage;
  date: string | null;
  region: string | null;
  branch: string | null;
  metric: string | null;
  value: string | null;
  note: string;
  recipients: VpQueryRecipientInput[];
}): Promise<void> {
  if (input.recipients.length === 0) throw new Error("At least one recipient is required.");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query<{ id: string }>(
      `insert into vp_query_threads
         (created_by, context_page, context_date, context_region, context_branch, context_metric, context_value, note)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id`,
      [
        input.createdBy,
        input.page,
        input.date,
        input.region,
        input.branch,
        input.metric,
        input.value,
        input.note.slice(0, 4000),
      ]
    );
    const threadId = rows[0].id;
    for (const recipient of input.recipients) {
      await client.query(
        `insert into vp_query_recipients (thread_id, recipient_type, recipient_region, recipient_branch)
         values ($1, $2, $3, $4)`,
        [
          threadId,
          recipient.type,
          recipient.type === "regional" ? recipient.region : null,
          recipient.type === "branch" ? recipient.branch : null,
        ]
      );
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

/** Every thread, newest first — HQ's full-oversight view (sees every
 * recipient on every thread, but can only reply to the 'hq' rows). */
export async function listAllVpQueryThreads(): Promise<VpQueryThread[]> {
  return threadsByCondition("true", []);
}

/** Threads with at least one recipient addressed to this region's manager. */
export async function listVpQueryThreadsForRegion(region: RegionName): Promise<VpQueryThread[]> {
  return threadsByCondition(
    "id in (select thread_id from vp_query_recipients where recipient_type = 'regional' and recipient_region = $1)",
    [region]
  );
}

/** Threads with at least one recipient addressed to this exact branch. */
export async function listVpQueryThreadsForBranch(branch: string): Promise<VpQueryThread[]> {
  return threadsByCondition(
    "id in (select thread_id from vp_query_recipients where recipient_type = 'branch' and recipient_branch = $1)",
    [branch]
  );
}

/** The VP's own inbox — every thread they raised. */
export async function listVpQueryThreadsForVp(createdBy: string): Promise<VpQueryThread[]> {
  return threadsByCondition("created_by = $1", [createdBy]);
}

/** Open recipient rows waiting on HQ — HQ's notification count. */
export async function countOpenForHq(): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `select count(*)::text as n from vp_query_recipients where recipient_type = 'hq' and status = 'open'`
  );
  return Number(rows[0]?.n ?? 0);
}

export async function countOpenForRegion(region: RegionName): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `select count(*)::text as n from vp_query_recipients where recipient_type = 'regional' and recipient_region = $1 and status = 'open'`,
    [region]
  );
  return Number(rows[0]?.n ?? 0);
}

export async function countOpenForBranch(branch: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `select count(*)::text as n from vp_query_recipients where recipient_type = 'branch' and recipient_branch = $1 and status = 'open'`,
    [branch]
  );
  return Number(rows[0]?.n ?? 0);
}

/** The VP's own notification badge — replies waiting to be read, across
 * every not-yet-archived thread they raised. */
export async function countAwaitingVp(createdBy: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `select count(*)::text as n
       from vp_query_recipients r
       join vp_query_threads t on t.id = r.thread_id
      where t.created_by = $1 and t.archived = false and r.status = 'answered'`,
    [createdBy]
  );
  return Number(rows[0]?.n ?? 0);
}

/** One recipient row, for verifying a reply is being posted by the admin it's actually addressed to. */
export async function getVpQueryRecipient(id: number): Promise<VpQueryRecipient | null> {
  const { rows } = await pool.query<RecipientRow>(`select ${RECIPIENT_COLUMNS} from vp_query_recipients where id = $1`, [id]);
  return rows[0] ? toRecipient(rows[0]) : null;
}

/** The one recipient replies — never touches any other recipient on the same thread. */
export async function replyToVpQueryRecipient(input: { id: number; repliedBy: string; reply: string }): Promise<void> {
  await pool.query(
    `update vp_query_recipients set reply = $2, replied_by = $3, replied_at = now(), status = 'answered' where id = $1`,
    [input.id, input.reply.slice(0, 4000), input.repliedBy]
  );
}

/** VP archives (or reopens) their own thread once they're satisfied. */
export async function setVpQueryThreadArchived(id: number, archived: boolean): Promise<void> {
  await pool.query(`update vp_query_threads set archived = $2 where id = $1`, [id, archived]);
}
