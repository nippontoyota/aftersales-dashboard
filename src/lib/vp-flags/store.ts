import { pool } from "../db";
import { regionForBranch, type RegionName } from "../regions";

/**
 * VP Service → HQ query threads (table `vp_flags`). The VP raises a flag
 * against whatever they were looking at — a page, a date, and optionally a
 * region / branch / metric label / the figure as displayed — with a note.
 * HQ answers in-app; the reply and a status live on the same row (no
 * threading beyond one question + one answer, per the spec). A regional
 * manager can read — not answer — flags that touch a branch in their region.
 */

export type VpFlagPage = "overview" | "region" | "branch";
export type VpFlagStatus = "open" | "answered" | "closed";

export type VpFlag = {
  id: number;
  createdBy: string;
  createdAt: string;
  page: VpFlagPage;
  date: string | null;
  region: string | null;
  branch: string | null;
  metric: string | null;
  value: string | null;
  note: string;
  status: VpFlagStatus;
  hqReply: string | null;
  repliedBy: string | null;
  repliedAt: string | null;
};

type Row = {
  id: string;
  created_by: string;
  created_at: string;
  context_page: VpFlagPage;
  context_date: string | null;
  context_region: string | null;
  context_branch: string | null;
  context_metric: string | null;
  context_value: string | null;
  note: string;
  status: VpFlagStatus;
  hq_reply: string | null;
  replied_by: string | null;
  replied_at: string | null;
};

function toFlag(r: Row): VpFlag {
  return {
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
    status: r.status,
    hqReply: r.hq_reply,
    repliedBy: r.replied_by,
    repliedAt: r.replied_at,
  };
}

const COLUMNS = `id, created_by, created_at, context_page, context_date::text as context_date,
  context_region, context_branch, context_metric, context_value, note, status,
  hq_reply, replied_by, replied_at`;

export async function createVpFlag(input: {
  createdBy: string;
  page: VpFlagPage;
  date: string | null;
  region: string | null;
  branch: string | null;
  metric: string | null;
  value: string | null;
  note: string;
}): Promise<void> {
  await pool.query(
    `insert into vp_flags
       (created_by, context_page, context_date, context_region, context_branch, context_metric, context_value, note)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.createdBy,
      input.page,
      input.date,
      input.region,
      input.branch,
      input.metric,
      input.value,
      input.note.slice(0, 4000),
    ],
  );
}

/** Every flag, newest first — the HQ / VP inbox. */
export async function listVpFlags(): Promise<VpFlag[]> {
  const { rows } = await pool.query<Row>(`select ${COLUMNS} from vp_flags order by created_at desc`);
  return rows.map(toFlag);
}

/** Flags whose branch (or, for a region-scoped flag, region) falls in the
 * given region — a regional manager's read-only slice. A flag with no
 * branch and no region (a company-wide Overview flag) is not shown. */
export async function listVpFlagsForRegion(region: RegionName): Promise<VpFlag[]> {
  const all = await listVpFlags();
  return all.filter((f) => {
    if (f.branch) return regionForBranch(f.branch) === region;
    if (f.region) return f.region === region;
    return false;
  });
}

export async function countOpenVpFlags(): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(`select count(*)::text as n from vp_flags where status = 'open'`);
  return Number(rows[0]?.n ?? 0);
}

export async function replyToVpFlag(input: {
  id: number;
  repliedBy: string;
  reply: string;
  status: Extract<VpFlagStatus, "answered" | "closed">;
}): Promise<void> {
  await pool.query(
    `update vp_flags
        set hq_reply = $2, replied_by = $3, replied_at = now(), status = $4
      where id = $1`,
    [input.id, input.reply.slice(0, 4000), input.repliedBy, input.status],
  );
}

/** VP closes their own thread once they're satisfied, or reopens it. */
export async function setVpFlagStatus(id: number, status: VpFlagStatus): Promise<void> {
  await pool.query(`update vp_flags set status = $2 where id = $1`, [id, status]);
}
