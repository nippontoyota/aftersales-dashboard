import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import "./load-env.mjs";
import { parseN9List } from "../src/lib/ce/n9.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const positional = args.filter((arg) => arg !== "--apply");
if (positional.length !== 1 || args.some((arg) => arg.startsWith("--") && arg !== "--apply")) {
  throw new Error("Usage: node scripts/import-n9-list.mjs <n9-file.csv> [--apply]");
}

const sourcePath = path.resolve(positional[0]);
const buffer = readFileSync(sourcePath);
const sha256 = createHash("sha256").update(buffer).digest("hex");
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const parsed = parseN9List(buffer, today);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}.`);
}

try {
  await client.query("begin");
  await client.query("select pg_advisory_xact_lock(20261022)");

  const prior = await client.query("select id from n9_imports where file_sha256 = $1", [sha256]);
  if (prior.rowCount) {
    await client.query("rollback");
    console.log(`N-9 import: no-op (this file is already audited as import ${prior.rows[0].id}).`);
    process.exitCode = 0;
  } else {
    await client.query(`
      create temp table n9_stage (
        vin text primary key,
        extract_date date not null,
        customer_name text,
        mobile_number text,
        registration_no text,
        vehicle_model text,
        vehicle_sales_type text,
        dm_planned_date date not null,
        first_call_planned_date date not null,
        icrop_recommended_name text,
        icrop_recommended_date date,
        activity_category text,
        activity_cat2_reason text
      ) on commit drop
    `);

    const chunkSize = 2_000;
    for (let start = 0; start < parsed.rows.length; start += chunkSize) {
      const records = parsed.rows.slice(start, start + chunkSize).map((row) => ({
        vin: row.vin,
        extract_date: row.extractDate,
        customer_name: row.customerName,
        mobile_number: row.mobileNumber,
        registration_no: row.registrationNo,
        vehicle_model: row.vehicleModel,
        vehicle_sales_type: row.vehicleSalesType,
        dm_planned_date: row.dmPlannedDate,
        first_call_planned_date: row.firstCallPlannedDate,
        icrop_recommended_name: row.icropRecommendedName,
        icrop_recommended_date: row.icropRecommendedDate,
        activity_category: row.activityCategory,
        activity_cat2_reason: row.activityCat2Reason,
      }));
      await client.query(
        `insert into n9_stage
         select * from jsonb_to_recordset($1::jsonb) as r(
           vin text, extract_date date, customer_name text, mobile_number text,
           registration_no text, vehicle_model text, vehicle_sales_type text,
           dm_planned_date date, first_call_planned_date date,
           icrop_recommended_name text, icrop_recommended_date date,
           activity_category text, activity_cat2_reason text
         )`,
        [JSON.stringify(records)],
      );
    }

    const staged = await client.query("select count(*)::int count from n9_stage");
    assertEqual(staged.rows[0].count, parsed.rows.length, "Staged row count");

    const matched = await client.query("select count(*)::int count from n9_stage s join ce_leads l using (vin)");

    const audit = await client.query(
      `insert into n9_imports (source_file_name, file_sha256, uploaded_by, row_count, extract_date)
       values ($1, $2, $3, $4, $5) returning id`,
      [path.basename(sourcePath), sha256, "admin", parsed.rows.length, parsed.extractDate],
    );
    const importId = audit.rows[0].id;

    await client.query(
      `insert into n9_leads (
         vin, extract_date, customer_name, mobile_number, registration_no, vehicle_model,
         vehicle_sales_type, dm_planned_date, first_call_planned_date, icrop_recommended_name,
         icrop_recommended_date, activity_category, activity_cat2_reason, source_import_id
       )
       select vin, extract_date, customer_name, mobile_number, registration_no, vehicle_model,
         vehicle_sales_type, dm_planned_date, first_call_planned_date, icrop_recommended_name,
         icrop_recommended_date, activity_category, activity_cat2_reason, $1
       from n9_stage
       on conflict (vin, extract_date) do nothing`,
      [importId],
    );

    if (apply) await client.query("commit");
    else await client.query("rollback");
    console.log(`N-9 import: ${apply ? "applied" : "dry run"}`);
    console.log({
      extractDate: parsed.extractDate,
      sourceRows: parsed.sourceRowCount,
      uniqueRows: parsed.rows.length,
      duplicateRows: parsed.duplicateRows,
      matchedInCeLeads: matched.rows[0].count,
    });
    if (!apply) console.log("No changes committed. Re-run with --apply after reviewing these aggregates.");
  }
} catch (error) {
  await client.query("rollback").catch(() => {});
  throw error;
} finally {
  await client.end();
}
