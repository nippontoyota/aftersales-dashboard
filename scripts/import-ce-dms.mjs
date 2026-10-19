import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import "./load-env.mjs";
import { parseDmsWorkbook } from "../src/lib/ce/dms.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const positional = args.filter((arg) => arg !== "--apply");
if (positional.length > 1 || args.some((arg) => arg.startsWith("--") && arg !== "--apply")) {
  throw new Error("Usage: node scripts/import-ce-dms.mjs [workbook.xlsx] [--apply]");
}

const sourcePath = path.resolve(positional[0] ?? "DMS DATA CLEANED.xlsx");
if (!sourcePath.toLowerCase().endsWith(".xlsx")) throw new Error("The DMS source must be an .xlsx workbook.");
const buffer = readFileSync(sourcePath);
const sha256 = createHash("sha256").update(buffer).digest("hex");
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const parsed = parseDmsWorkbook(buffer, today);

const EXPECTED_SUPPLIED_FILE = {
  sha256: "d77573047218712b281d081781d80d0db719cbc40ed83e727287081494570965",
  sourceRows: 153_316,
  uniqueRows: 153_316,
  matched: 8_592,
  inserted: 144_724,
  active: 153_522,
  contacts: 151_235,
  advanced: 5_165,
  age: { hot: 114_770, warm: 26_918, cold: 11_834 },
  avf: { red: 5_023, yellow: 2_013, green: 1_762, unavailable: 144_724 },
};

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}.`);
}

try {
  await client.query("begin");
  await client.query("select pg_advisory_xact_lock(20261017)");

  const prior = await client.query("select id from ce_lead_imports where file_sha256 = $1", [sha256]);
  if (prior.rowCount) {
    await client.query("rollback");
    console.log(`DMS import: no-op (this file is already audited as import ${prior.rows[0].id}).`);
    process.exitCode = 0;
  } else {
    await client.query(`
      create temp table ce_dms_stage (
        vin text primary key,
        customer_name text not null,
        contact_number text,
        vehicle_model text not null,
        delivery_date date not null,
        latest_service_date date not null,
        latest_mileage numeric not null,
        sale_branch_code text not null,
        latest_service_branch_code text not null,
        allocated_dealer text not null,
        dealer_zone text not null
      ) on commit drop
    `);

    const chunkSize = 2_000;
    for (let start = 0; start < parsed.rows.length; start += chunkSize) {
      const records = parsed.rows.slice(start, start + chunkSize).map((row) => ({
        vin: row.vin,
        customer_name: row.customerName,
        contact_number: row.contactNumber,
        vehicle_model: row.vehicleModel,
        delivery_date: row.deliveryDate,
        latest_service_date: row.latestServiceDate,
        latest_mileage: row.latestMileage,
        sale_branch_code: row.saleBranchCode,
        latest_service_branch_code: row.latestServiceBranchCode,
        allocated_dealer: row.allocatedDealer,
        dealer_zone: row.dealerZone,
      }));
      await client.query(
        `insert into ce_dms_stage
         select * from jsonb_to_recordset($1::jsonb) as r(
           vin text, customer_name text, contact_number text, vehicle_model text,
           delivery_date date, latest_service_date date, latest_mileage numeric,
           sale_branch_code text, latest_service_branch_code text,
           allocated_dealer text, dealer_zone text
         )`,
        [JSON.stringify(records)],
      );
    }

    const staged = await client.query("select count(*)::int count from ce_dms_stage");
    assertEqual(staged.rows[0].count, parsed.rows.length, "Staged row count");
    await client.query("create temp table ce_dms_active_before on commit drop as select vin from ce_leads where active");
    await client.query("create temp table ce_dms_workflow_before on commit drop as select * from ce_lead_workflow");
    await client.query("create temp table ce_dms_activity_before on commit drop as select * from ce_lead_activity");
    await client.query(`
      create temp table ce_dms_match_before on commit drop as
      select l.vin, l.n_report_date, l.n_mileage, s.latest_service_date, s.latest_mileage
      from ce_leads l join ce_dms_stage s using (vin)
    `);

    const before = await client.query(`
      select
        (select count(*)::int from ce_dms_match_before) matched,
        (select count(*)::int from ce_dms_match_before where latest_service_date > n_report_date) advanced,
        (select count(*)::int from ce_dms_match_before where latest_service_date > n_report_date and latest_mileage < n_mileage) negative_avf_warnings,
        (select count(*)::int from ce_dms_stage s left join ce_leads l using (vin) where l.vin is null) inserted
    `);
    const audit = await client.query(
      `insert into ce_lead_imports
       (source_file_name, import_kind, file_sha256, uploaded_by, row_count, min_report_date, max_report_date)
       values ($1, 'dms', $2, 'admin', $3, $4, $5) returning id`,
      [path.basename(sourcePath), sha256, parsed.rows.length, parsed.minReportDate, parsed.maxReportDate],
    );
    const importId = audit.rows[0].id;

    await client.query(
      `update ce_leads l set
         contact_number = coalesce(s.contact_number, l.contact_number),
         vehicle_model = coalesce(nullif(s.vehicle_model, ''), l.vehicle_model),
         customer_first_name = case when coalesce(l.customer_first_name, '') = '' and coalesce(l.customer_family_name, '') = '' then s.customer_name else l.customer_first_name end,
         allocated_dealer = case when s.latest_service_date > l.n_report_date then s.allocated_dealer else l.allocated_dealer end,
         dealer_zone = case when s.latest_service_date > l.n_report_date then s.dealer_zone else l.dealer_zone end,
         n2_dealer_code = case when s.latest_service_date > l.n_report_date then l.n1_dealer_code else l.n2_dealer_code end,
         n2_report_date = case when s.latest_service_date > l.n_report_date then l.n1_report_date else l.n2_report_date end,
         n2_mileage = case when s.latest_service_date > l.n_report_date then l.n1_mileage else l.n2_mileage end,
         n1_dealer_code = case when s.latest_service_date > l.n_report_date then l.n_dealer_code else l.n1_dealer_code end,
         n1_report_date = case when s.latest_service_date > l.n_report_date then l.n_report_date else l.n1_report_date end,
         n1_mileage = case when s.latest_service_date > l.n_report_date then l.n_mileage else l.n1_mileage end,
         n_dealer_code = case when s.latest_service_date > l.n_report_date then s.latest_service_branch_code else l.n_dealer_code end,
         n_report_date = greatest(s.latest_service_date, l.n_report_date),
         n_mileage = case when s.latest_service_date > l.n_report_date then s.latest_mileage else l.n_mileage end,
         avf = case when s.latest_service_date > l.n_report_date then (s.latest_mileage - l.n_mileage) / 10000.0 else l.avf end,
         dms_import_id = $1,
         active = true
       from ce_dms_stage s where l.vin = s.vin`,
      [importId],
    );

    await client.query(
      `insert into ce_leads (
         allocated_dealer, dealer_zone, vin, sale_dealer_code, sales_date, uio_year,
         sale_branch_code, n_dealer_code, avf, n_report_date, n_mileage,
         n1_dealer_code, n1_report_date, n1_mileage, n2_dealer_code, n2_mileage,
         n2_report_date, customer_first_name, customer_family_name, contact_number,
         vehicle_model, active, source_import_id, dms_import_id, imported_at
       )
       select s.allocated_dealer, s.dealer_zone, s.vin, s.sale_branch_code,
         s.delivery_date, extract(year from s.delivery_date)::int, s.sale_branch_code,
         s.latest_service_branch_code, null, s.latest_service_date, s.latest_mileage,
         null, null, null, null, null, null, s.customer_name, '', s.contact_number,
         nullif(s.vehicle_model, ''), true, $1, $1, now()
       from ce_dms_stage s left join ce_leads l using (vin)
       where l.vin is null`,
      [importId],
    );
    await client.query(`insert into ce_lead_workflow (vin) select vin from ce_leads where active on conflict (vin) do nothing`);

    const validation = await client.query(
      `select
         count(*) filter (where active)::int active,
         count(*) filter (where active and contact_number ~ '^\\+91[6-9][0-9]{9}$')::int contacts,
         count(*) filter (where active and ($1::date - n_report_date) between 0 and 364)::int hot,
         count(*) filter (where active and ($1::date - n_report_date) between 365 and 730)::int warm,
         count(*) filter (where active and ($1::date - n_report_date) >= 731)::int cold,
         count(*) filter (where active and n1_mileage is not null and (n_mileage - n1_mileage) / 10000.0 < 1)::int red,
         count(*) filter (where active and n1_mileage is not null and (n_mileage - n1_mileage) / 10000.0 between 1 and 1.7)::int yellow,
         count(*) filter (where active and n1_mileage is not null and (n_mileage - n1_mileage) / 10000.0 > 1.7)::int green,
         count(*) filter (where active and n1_mileage is null)::int unavailable
       from ce_leads`,
      [today],
    );
    const preserved = await client.query(`
      select
        (select count(*)::int from ce_dms_active_before b join ce_leads l using (vin) where not l.active) archived,
        (select count(*)::int from ce_dms_workflow_before b join ce_lead_workflow w using (vin)
          where row(b.status, b.next_follow_up_date, b.attempt_count, b.latest_call_status, b.latest_outcome, b.last_editor, b.updated_at)
          is distinct from row(w.status, w.next_follow_up_date, w.attempt_count, w.latest_call_status, w.latest_outcome, w.last_editor, w.updated_at)) workflow_changes,
        ((select count(*) from ce_dms_activity_before) - (select count(*) from ce_lead_activity))::int activity_count_delta,
        (select count(*)::int from ce_leads l left join ce_lead_workflow w using (vin) where l.active and w.vin is null) active_without_workflow,
        (select count(*)::int from ce_leads l join ce_lead_workflow w using (vin) where l.source_import_id = $1 and (w.status <> 'New' or w.attempt_count <> 0)) invalid_new_workflows
    `, [importId]);

    const result = { ...before.rows[0], ...validation.rows[0], ...preserved.rows[0] };
    assertEqual(result.archived, 0, "Leads archived by DMS import");
    assertEqual(result.workflow_changes, 0, "Existing workflow rows changed");
    assertEqual(result.activity_count_delta, 0, "Activity rows changed");
    assertEqual(result.active_without_workflow, 0, "Active leads without workflow");
    assertEqual(result.invalid_new_workflows, 0, "New leads outside F0/New workflow");
    assertEqual(result.hot + result.warm + result.cold, result.active, "Age category total");
    assertEqual(result.red + result.yellow + result.green + result.unavailable, result.active, "AVF category total");

    if (sha256 === EXPECTED_SUPPLIED_FILE.sha256) {
      const expected = EXPECTED_SUPPLIED_FILE;
      assertEqual(parsed.sourceRowCount, expected.sourceRows, "Supplied workbook source rows");
      assertEqual(parsed.rows.length, expected.uniqueRows, "Supplied workbook unique rows");
      assertEqual(result.matched, expected.matched, "Matched leads");
      assertEqual(result.inserted, expected.inserted, "Inserted leads");
      assertEqual(result.advanced, expected.advanced, "Advanced service histories");
      assertEqual(result.active, expected.active, "Active leads");
      assertEqual(result.contacts, expected.contacts, "Leads with valid contact");
      for (const key of Object.keys(expected.age)) assertEqual(result[key], expected.age[key], `${key} age leads`);
      for (const key of Object.keys(expected.avf)) assertEqual(result[key], expected.avf[key], `${key} AVF leads`);
    }

    if (apply) await client.query("commit");
    else await client.query("rollback");
    console.log(`DMS import: ${apply ? "applied" : "dry run"}`);
    console.log({
      sourceRows: parsed.sourceRowCount,
      uniqueRows: parsed.rows.length,
      duplicateRows: parsed.duplicateRows,
      matched: result.matched,
      inserted: result.inserted,
      advanced: result.advanced,
      negativeAvfWarnings: result.negative_avf_warnings,
      active: result.active,
      validContacts: result.contacts,
      age: { hot: result.hot, warm: result.warm, cold: result.cold },
      avf: { red: result.red, yellow: result.yellow, green: result.green, unavailable: result.unavailable },
      archived: result.archived,
    });
    if (!apply) console.log("No changes committed. Re-run with --apply after reviewing these aggregates.");
  }
} catch (error) {
  await client.query("rollback").catch(() => {});
  throw error;
} finally {
  await client.end();
}
