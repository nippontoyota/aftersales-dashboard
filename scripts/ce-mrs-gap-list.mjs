import pg from "pg";
import "./load-env.mjs";
import { CE_DUE_KM, CE_DUE_MONTHS, CE_MIN_PLAUSIBLE_KM_PER_DAY, CE_MRS_WINDOW_DAYS, indiaDate } from "../src/lib/ce/rules.ts";

// Read-only report: the same daily MRS catch-list the /ce/mrs page shows
// (src/lib/ce/store.ts's loadCeMrsGapList) — this can't import that
// function directly (store.ts starts with `import "server-only"`, a
// Next.js-only guard that doesn't resolve under plain Node, same reason
// every other script here runs its own SQL rather than reusing store.ts),
// so this runs the identical query through its own pg.Client instead.
// Keep this in sync with loadCeMrsGapList's MRS_DUE_DATE_CTE if that
// formula ever changes. See project_mrs_n9_system.md.

const today = indiaDate();
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const { rows } = await client.query(
  `with mrs_base as (
     select l.vin, l.allocated_dealer, l.customer_first_name, l.customer_family_name,
            l.contact_number, l.vehicle_model, l.n_report_date, l.n_mileage,
            case
              when l.n1_report_date is not null and l.n1_mileage is not null
                   and (l.n_report_date - l.n1_report_date) > 0
                   and (l.n_mileage - l.n1_mileage)::numeric / (l.n_report_date - l.n1_report_date) >= $3
                then (l.n_mileage - l.n1_mileage)::numeric / (l.n_report_date - l.n1_report_date)
              when l.sales_date is not null and (l.n_report_date - l.sales_date) > 0
                   and l.n_mileage::numeric / (l.n_report_date - l.sales_date) >= $3
                then l.n_mileage::numeric / (l.n_report_date - l.sales_date)
              else null
            end as rate
     from ce_leads l
     where l.active and l.n_mileage is not null and l.sales_date is not null and l.n_report_date is not null
   ),
   mrs_due as (
     select *,
       (n_report_date + $4 * interval '1 month')::date as months_due,
       case when rate is not null then (n_report_date + ($5::numeric / rate) * interval '1 day')::date end as km_due
     from mrs_base
   ),
   mrs_final as (
     select vin, allocated_dealer, trim(concat_ws(' ', customer_first_name, customer_family_name)) customer_name,
            contact_number, vehicle_model, n_report_date, n_mileage,
            case when km_due is not null and km_due < months_due then km_due else months_due end as due_date
     from mrs_due
   )
   select f.* from mrs_final f
   where f.due_date between $1::date - $2 * interval '1 day' and $1::date + $2 * interval '1 day'
     and not exists (select 1 from n9_leads n where n.vin = f.vin)
   order by f.due_date, f.vin`,
  [today, CE_MRS_WINDOW_DAYS, CE_MIN_PLAUSIBLE_KM_PER_DAY, CE_DUE_MONTHS, CE_DUE_KM],
);

console.log(`window: today ${today} +/- ${CE_MRS_WINDOW_DAYS} days`);
console.log("DAILY GAP LIST total:", rows.length);
console.log("\nsample (first 20):");
for (const r of rows.slice(0, 20)) {
  console.log(
    ` ${r.vin} | due ${r.due_date.toISOString().slice(0, 10)} | last visit ${r.n_report_date.toISOString().slice(0, 10)} @ ${r.n_mileage}km | ` +
    `${r.customer_name || "Unnamed"} | ${r.contact_number ?? "no contact"} | ${r.allocated_dealer || ""}`,
  );
}

await client.end();
