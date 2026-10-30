import pg from "pg";
import "./load-env.mjs";
import { ceDueDate, indiaDate } from "../src/lib/ce/rules.ts";

// Read-only report: of our active ce_leads, which fall due within a
// rolling window around today by our own proxy formula (rules.ts's
// ceDueDate) and have never appeared on any N-9 list we've imported —
// i.e. the actual "TKM's pipeline missed this one" daily catch list.
//
// Deliberately bounded to a +/-14-day window, not "ever due": a flat
// 6-month/10,000km proxy with no decay flags ~half of all active
// ce_leads as "due" once you include anyone ever overdue (confirmed
// 2026-10-30 — see project_mrs_n9_system.md). That's a reactivation
// backlog, a different problem from "who did today's equivalent of
// TKM's N-9 miss" — this script answers the latter only. The backlog
// itself is reported separately below, not folded into the daily list.

const today = indiaDate();
const WINDOW_DAYS = 14;
const windowStart = addDays(today, -WINDOW_DAYS);
const windowEnd = addDays(today, WINDOW_DAYS);

function addDays(dateIso, days) {
  return new Date(Date.parse(`${dateIso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const { rows: leads } = await client.query(`
  select vin, sales_date::text as sales_date, n_report_date::text as n_report_date, n_mileage,
         n1_report_date::text as n1_report_date, n1_mileage, customer_first_name, customer_family_name,
         contact_number, allocated_dealer
  from ce_leads where active
`);
console.log("active ce_leads:", leads.length);
console.log(`daily window: due date between ${windowStart} and ${windowEnd} (today ${today} +/- ${WINDOW_DAYS} days)\n`);

const dailyWindow = [];
for (const lead of leads) {
  if (lead.n_mileage === null || lead.sales_date === null || lead.n_report_date === null) continue;
  const due = ceDueDate({
    salesDate: lead.sales_date,
    nReportDate: lead.n_report_date,
    nMileage: Number(lead.n_mileage),
    n1ReportDate: lead.n1_report_date,
    n1Mileage: lead.n1_mileage !== null ? Number(lead.n1_mileage) : null,
  });
  if (due < windowStart) continue; // older than the window: backlog, not today's list
  if (due > windowEnd) continue; // not due yet within the window either
  dailyWindow.push({ ...lead, dueDate: due });
}
console.log("in the daily window (due within +/-14 days of today):", dailyWindow.length);

const vins = dailyWindow.map((l) => l.vin);
const { rows: covered } = await client.query("select distinct vin from n9_leads where vin = any($1::text[])", [vins]);
const coveredSet = new Set(covered.map((r) => r.vin));
console.log("of those, already covered by an N-9 list we have:", coveredSet.size);

const gap = dailyWindow.filter((l) => !coveredSet.has(l.vin));
console.log("\nDAILY GAP LIST — in-window, due, never on an N-9 list we have:", gap.length);

const upcoming = gap.filter((l) => l.dueDate >= today).length;
const justMissed = gap.filter((l) => l.dueDate < today).length;
console.log(`  of which upcoming (due today or later): ${upcoming}, already past due within the window: ${justMissed}`);

console.log("\nsample (first 20, sorted by due date):");
for (const l of gap.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 20)) {
  console.log(
    ` ${l.vin} | due ${l.dueDate} | last visit ${l.n_report_date} @ ${l.n_mileage}km | ` +
    `${l.customer_first_name ?? ""} ${l.customer_family_name ?? ""} | ${l.contact_number ?? "no contact"} | ${l.allocated_dealer ?? ""}`,
  );
}

await client.end();
