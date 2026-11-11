import "server-only";
import { pool } from "@/lib/db";
import { deriveCeCallUpdate, indiaDate, type CeCallStatus, type CeFollowUpFilter, type CeStatus } from "./rules";

function dateOnly(value: unknown): string {
  return String(value ?? "").slice(0, 10);
}

export type CeConquestListRow = {
  id: string;
  registrationNo: string;
  vin: string | null;
  ownerName: string | null;
  ownerMobile: string | null;
  vehicleModel: string | null;
  vehicleMaker: string | null;
  registrationDate: string | null;
  sourceFile: string;
  status: CeStatus;
  nextFollowUpDate: string | null;
  attemptCount: number;
  assignedTo: string | null;
};

/** Mirrors loadCeLeadPage's shape, trimmed to what conquest leads actually
 * have: no service history, so no age/category/month/year-of-last-visit —
 * these are cold RTO-sourced prospects, not existing customers due for a
 * reminder (see ce_conquest_leads' doc comment in schema.sql).
 *
 * pmMonths is the one exception (2026-11-11, at the user's request): since
 * there's no mileage or service history to project a real due date from,
 * the closest thing to "which month is this vehicle due" is the calendar
 * month of its registration anniversary, repeating every year — not TKM's
 * actual per-model milestone schedule (unknown to us), just an even way to
 * pace outreach across the year instead of one 24,000-lead pile. */
export async function loadConquestLeadPage(options: {
  today: string;
  query?: string;
  statuses?: CeStatus[];
  followUps?: CeFollowUpFilter[];
  pmMonths?: number[];
  assignedTo?: string;
  page?: number;
}) {
  const values: unknown[] = [options.today];
  const where = ["l.active"];
  if (options.assignedTo) {
    values.push(options.assignedTo);
    where.push(`w.assigned_to = $${values.length}`);
  }
  if (options.query) {
    values.push(`%${options.query}%`);
    where.push(`(l.registration_no ilike $${values.length} or l.vin ilike $${values.length} or l.owner_name ilike $${values.length} or l.owner_mobile ilike $${values.length} or l.vehicle_model ilike $${values.length})`);
  }
  if (options.statuses?.length) {
    values.push(options.statuses);
    where.push(`w.status = any($${values.length}::text[])`);
  }
  if (options.followUps?.length) {
    const followUps = {
      due: "(w.next_follow_up_date <= $1::date and w.status not in ('Converted', 'Vehicle sold', 'Serviced elsewhere', 'Not interested', 'Unreachable', 'Appointment booked'))",
      upcoming: "(w.next_follow_up_date > $1::date and w.status not in ('Converted', 'Vehicle sold', 'Serviced elsewhere', 'Not interested', 'Unreachable', 'Appointment booked'))",
      none: "w.next_follow_up_date is null",
    } as const;
    where.push(`(${options.followUps.map((filter) => followUps[filter]).join(" or ")})`);
  }
  if (options.pmMonths?.length) {
    values.push(options.pmMonths);
    where.push(`extract(month from l.registration_date)::int = any($${values.length}::int[])`);
  }
  const clause = where.join(" and ");
  const page = Math.max(1, options.page ?? 1);
  const limit = 50;
  const filterValues = [...values];
  values.push(limit, (page - 1) * limit);

  const [list, countRow, statusCounts, monthCounts] = await Promise.all([
    pool.query(
      `select l.id, l.registration_no, l.vin, l.owner_name, l.owner_mobile, l.vehicle_model, l.vehicle_maker,
         l.registration_date, l.source_file, w.status, w.next_follow_up_date, w.attempt_count, w.assigned_to
       from ce_conquest_leads l join ce_conquest_workflow w on w.conquest_lead_id = l.id
       where ${clause}
       order by l.registration_date desc nulls last, l.id
       limit $${values.length - 1} offset $${values.length}`,
      values,
    ),
    pool.query<{ count: string }>(
      `select count(*) from ce_conquest_leads l join ce_conquest_workflow w on w.conquest_lead_id = l.id where ${clause}`,
      filterValues,
    ),
    pool.query<{ status: CeStatus; count: string }>(
      `select w.status, count(*) from ce_conquest_leads l join ce_conquest_workflow w on w.conquest_lead_id = l.id where l.active group by w.status`,
    ),
    pool.query<{ month: number; count: string }>(
      `select extract(month from registration_date)::int as month, count(*)
       from ce_conquest_leads where active and registration_date is not null
       group by month`,
    ),
  ]);

  const rows: CeConquestListRow[] = list.rows.map((row) => ({
    id: String(row.id),
    registrationNo: row.registration_no,
    vin: row.vin,
    ownerName: row.owner_name,
    ownerMobile: row.owner_mobile,
    vehicleModel: row.vehicle_model,
    vehicleMaker: row.vehicle_maker,
    registrationDate: row.registration_date ? dateOnly(row.registration_date) : null,
    sourceFile: row.source_file,
    status: row.status,
    nextFollowUpDate: row.next_follow_up_date ? dateOnly(row.next_follow_up_date) : null,
    attemptCount: Number(row.attempt_count),
    assignedTo: row.assigned_to,
  }));
  const total = Number(countRow.rows[0].count);
  return {
    rows,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / limit)),
    totalCount: statusCounts.rows.reduce((sum, r) => sum + Number(r.count), 0),
    statusCounts: Object.fromEntries(statusCounts.rows.map((r) => [r.status, Number(r.count)])) as Partial<Record<CeStatus, number>>,
    pmMonthCounts: Object.fromEntries(monthCounts.rows.map((r) => [r.month, Number(r.count)])) as Partial<Record<number, number>>,
  };
}

export type CeConquestActivityItem = {
  id: string;
  previousStatus: string;
  status: string;
  nextFollowUpDate: string | null;
  note: string;
  attemptNumber: number | null;
  callStatus: CeCallStatus | null;
  outcome: string | null;
  author: string;
  createdAt: string;
};

export type CeConquestLeadDetail = CeConquestListRow & { address: string | null };

export async function loadConquestLead(id: string): Promise<{ lead: CeConquestLeadDetail; activity: CeConquestActivityItem[] } | null> {
  const [leadResult, activityResult] = await Promise.all([
    pool.query(
      `select l.id, l.registration_no, l.vin, l.owner_name, l.owner_mobile, l.vehicle_model, l.vehicle_maker,
         l.registration_date, l.address, l.source_file, w.status, w.next_follow_up_date, w.attempt_count, w.assigned_to
       from ce_conquest_leads l join ce_conquest_workflow w on w.conquest_lead_id = l.id
       where l.id = $1 and l.active`,
      [id],
    ),
    pool.query("select * from ce_conquest_activity where conquest_lead_id = $1 order by created_at desc, id desc", [id]),
  ]);
  const row = leadResult.rows[0];
  if (!row) return null;
  return {
    lead: {
      id: String(row.id),
      registrationNo: row.registration_no,
      vin: row.vin,
      ownerName: row.owner_name,
      ownerMobile: row.owner_mobile,
      vehicleModel: row.vehicle_model,
      vehicleMaker: row.vehicle_maker,
      registrationDate: row.registration_date ? dateOnly(row.registration_date) : null,
      address: row.address,
      sourceFile: row.source_file,
      status: row.status,
      nextFollowUpDate: row.next_follow_up_date ? dateOnly(row.next_follow_up_date) : null,
      attemptCount: Number(row.attempt_count),
      assignedTo: row.assigned_to,
    },
    activity: activityResult.rows.map((item) => ({
      id: String(item.id),
      previousStatus: item.previous_status,
      status: item.status,
      nextFollowUpDate: item.next_follow_up_date ? dateOnly(item.next_follow_up_date) : null,
      note: item.note,
      attemptNumber: item.attempt_number === null ? null : Number(item.attempt_number),
      callStatus: item.call_status,
      outcome: item.outcome,
      author: item.author,
      createdAt: new Date(item.created_at).toISOString(),
    })),
  };
}

/** Mirrors updateCeLead exactly (same deriveCeCallUpdate state machine),
 * just against the conquest tables instead of ce_leads/ce_lead_workflow. */
export async function updateConquestLead(input: {
  id: string;
  callStatus: string;
  outcome: string;
  nextFollowUpDate: string | null;
  note: string;
  username: string;
  requireAssignedTo?: string;
}) {
  if (!input.note.trim()) throw new Error("What the customer said is required.");
  if (input.note.length > 2_000) throw new Error("Keep the customer response to 2,000 characters or fewer.");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query<{ active: boolean; status: CeStatus; attempt_count: number; assigned_to: string | null }>(
      `select l.active, w.status, w.attempt_count, w.assigned_to from ce_conquest_leads l join ce_conquest_workflow w on w.conquest_lead_id = l.id where l.id = $1 for update of w`,
      [input.id],
    );
    if (!current.rows[0]) throw new Error("Lead not found.");
    if (!current.rows[0].active) throw new Error("Archived leads are read-only.");
    if (input.requireAssignedTo && current.rows[0].assigned_to !== input.requireAssignedTo) throw new Error("This lead isn't assigned to you.");
    const next = deriveCeCallUpdate({
      currentAttemptCount: Number(current.rows[0].attempt_count),
      callStatus: input.callStatus,
      outcome: input.outcome,
      followUpDate: input.nextFollowUpDate,
      today: indiaDate(),
    });
    await client.query(
      `update ce_conquest_workflow set status = $2, next_follow_up_date = $3, attempt_count = $4,
       latest_call_status = $5, latest_outcome = $6, last_editor = $7, updated_at = now() where conquest_lead_id = $1`,
      [input.id, next.status, next.nextFollowUpDate, next.attemptCount, next.callStatus, next.outcome, input.username],
    );
    await client.query(
      `insert into ce_conquest_activity
       (conquest_lead_id, previous_status, status, next_follow_up_date, note, attempt_number, call_status, outcome, author)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [input.id, current.rows[0].status, next.status, next.nextFollowUpDate, input.note.trim(), next.attemptCount, next.callStatus, next.outcome, input.username],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Mirrors assignCeLeadsEvenly — same round-robin rule, conquest_lead_id in
 * place of vin. */
export async function assignConquestLeadsEvenly(input: { ids: string[]; agents: string[] }): Promise<{ assignedCount: number }> {
  if (input.ids.length === 0 || input.agents.length === 0) return { assignedCount: 0 };
  const assignments = input.ids.map((id, i) => ({ id, assigned_to: input.agents[i % input.agents.length] }));
  await pool.query(
    `update ce_conquest_workflow w set assigned_to = a.assigned_to
     from jsonb_to_recordset($1::jsonb) as a(id bigint, assigned_to text)
     where w.conquest_lead_id = a.id`,
    [JSON.stringify(assignments)],
  );
  return { assignedCount: assignments.length };
}
