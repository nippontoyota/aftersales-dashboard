// Backfills cancelled_accessories_adjustments and cross_month_replacements
// from scratch (2026-10-01 perf fix — see db/schema.sql's comment on those
// two tables, and src/lib/cancellation/adjustment-recompute.ts). Both tables
// start empty after `node db/migrate.mjs` creates them; report.ts's two
// consumers (ssrv089/cancellation-adjustment.ts, cancellation/
// cross-month-replacement.ts) read ONLY from these tables once the new code
// ships, so this MUST run before/with that deploy — otherwise every GUS
// Parts/Labour MTD figure would silently lose its cancellation correction
// until the next relevant upload happens to trigger a recompute.
//
// Run: node db/backfill-cancellation-adjustments.mjs
//
// Safe to re-run — every branch+month is recomputed from the live data and
// replaces whatever was there before. Mirrors the exact SQL in
// src/lib/ssrv089/cancellation-adjustment.ts and
// src/lib/cancellation/cross-month-replacement.ts — keep both in sync if
// either query changes.
import { Client } from "pg";
import "../scripts/load-env.mjs";

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true, ca: process.env.DATABASE_CA_CERT } });
await client.connect();

function toNumericExpr(column) {
  return `coalesce(nullif(regexp_replace(coalesce(r.row_data->>'${column}', ''), '[^0-9.\\-]', '', 'g'), '')::numeric, 0)`;
}

// --- cancelled_accessories_adjustments ---
console.log("=== Backfilling cancelled_accessories_adjustments ===");

const { rows: branches } = await client.query(`select distinct branch from invoice_cancellations order by branch`);
let accessoriesRows = 0;

for (const { branch } of branches) {
  const { rows: monthRows } = await client.query(
    `select distinct coalesce(to_char(issue_date, 'YYYY-MM'), month) as revenue_month
     from invoice_cancellations where branch = $1`,
    [branch]
  );
  const months = monthRows.map((r) => r.revenue_month);

  for (const month of months) {
    const { rows } = await client.query(
      `
      with canc as (
        select branch, replace(doc_no, '-', '') as doc_key,
               coalesce(to_char(issue_date, 'YYYY-MM'), month) as revenue_month
        from invoice_cancellations
        where branch = $2
      ),
      ssrv as (
        select r.branch,
               replace(coalesce(r.row_data->>'Invoice Doc No.', ''), '-', '') as inv,
               trim(coalesce(r.row_data->>'Close SA Name', '')) as close_sa_name,
               ${toNumericExpr("Part Sale")} as part_sale,
               ${toNumericExpr("Labour Sale")} as labour_sale
        from raw_upload_rows r
        where r.report_type = 'ssrv089'
          and r.branch = $2
          and r.date >= date_trunc('month', $3::date)
          and r.date < date_trunc('month', $3::date) + interval '1 month'
      )
      select sum(s.part_sale) as part_sale, sum(s.labour_sale) as labour_sale
      from ssrv s
      join canc c on c.branch = s.branch and c.doc_key = s.inv and c.revenue_month = $1
      join accessories_staff a
        on a.branch = s.branch
       and lower(regexp_replace(a.name, '\\s+', ' ', 'g')) = lower(regexp_replace(s.close_sa_name, '\\s+', ' ', 'g'))
      where s.inv <> ''
      `,
      [month, branch, `${month}-01`]
    );

    await client.query(`delete from cancelled_accessories_adjustments where branch = $1 and revenue_month = $2`, [branch, month]);
    const row = rows[0];
    if (row && row.part_sale !== null) {
      await client.query(
        `insert into cancelled_accessories_adjustments (branch, revenue_month, part_sale, labour_sale) values ($1, $2, $3, $4)`,
        [branch, month, row.part_sale, row.labour_sale]
      );
      accessoriesRows++;
    }
  }
  console.log(`  ${branch}: ${months.length} months checked`);
}
console.log(`\nInserted ${accessoriesRows} branch-month adjustment rows.`);

// --- cross_month_replacements ---
console.log("\n=== Backfilling cross_month_replacements ===");
const CROSS_MONTH_REPLACEMENT_BRANCHES = ["KT01A"]; // keep in sync with cross-month-replacement.ts
console.log(`Branches: ${CROSS_MONTH_REPLACEMENT_BRANCHES.join(", ")}`);

const { rows: boundRows } = await client.query(
  `select min(coalesce(issue_date, (month || '-01')::date))::text as earliest
   from invoice_cancellations
   where branch = any($1::text[]) and ref_doc_no is not null and ref_doc_no <> ''`,
  [CROSS_MONTH_REPLACEMENT_BRANCHES]
);
const earliest = boundRows[0]?.earliest;

await client.query("begin");
await client.query(`delete from cross_month_replacements where branch = any($1::text[])`, [CROSS_MONTH_REPLACEMENT_BRANCHES]);

if (earliest) {
  const { rows } = await client.query(
    `
    with canc as (
      select doc_no, branch, ref_doc_no,
             coalesce(to_char(issue_date, 'YYYY-MM'), month) as revenue_month,
             replace(doc_no, '-', '') as doc_key
      from invoice_cancellations
      where branch = any($1::text[]) and ref_doc_no is not null and ref_doc_no <> ''
    ),
    ssrv_dedup as (
      select branch, ro, inv, row_month,
             max(part_sale) as part_sale, max(oil_sale) as oil_sale, max(labour_sale) as labour_sale
      from (
        select r.branch,
               replace(r.row_data->>'JobOrder No', '-', '') as ro,
               replace(coalesce(r.row_data->>'Invoice Doc No.', ''), '-', '') as inv,
               to_char(r.date, 'YYYY-MM') as row_month,
               ${toNumericExpr("Part Sale")} as part_sale,
               ${toNumericExpr("Oil Sale")} as oil_sale,
               ${toNumericExpr("Labour Sale")} as labour_sale
        from raw_upload_rows r
        where r.report_type = 'ssrv089' and r.branch = any($1::text[]) and r.date >= $2::date
      ) x
      group by branch, ro, inv, row_month
    )
    select c.branch, c.doc_no as cancelled_doc, c.ref_doc_no, c.revenue_month as cancelled_month,
           s.inv as replacement_doc, s.row_month as replacement_month,
           s.part_sale + s.oil_sale as part_sale, s.labour_sale
    from canc c
    join ssrv_dedup s on s.branch = c.branch and s.ro = c.ref_doc_no and s.inv <> c.doc_key and s.inv <> ''
    where s.row_month > c.revenue_month
    order by c.branch, c.revenue_month, c.doc_no
    `,
    [CROSS_MONTH_REPLACEMENT_BRANCHES, earliest]
  );

  for (const r of rows) {
    await client.query(
      `insert into cross_month_replacements
         (branch, cancelled_doc_no, ref_doc_no, cancelled_month, replacement_doc_no, replacement_month, part_sale, labour_sale)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [r.branch, r.cancelled_doc, r.ref_doc_no, r.cancelled_month, r.replacement_doc, r.replacement_month, r.part_sale, r.labour_sale]
    );
  }
  console.log(`Inserted ${rows.length} cross-month-replacement rows.`);
} else {
  console.log("No qualifying cancellations — nothing to insert.");
}
await client.query("commit");

const { rows: counts } = await client.query(`
  select
    (select count(*) from cancelled_accessories_adjustments) as accessories_rows,
    (select count(*) from cross_month_replacements) as cross_month_rows
`);
console.log("\nFinal row counts:", counts[0]);

await client.end();
console.log("\nBackfill complete.");
