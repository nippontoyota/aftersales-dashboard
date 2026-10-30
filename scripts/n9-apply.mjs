function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}.`);
}

/** Stages and applies one already-parsed N-9 batch (shape matching
 * parseN9List's return value) to n9_imports/n9_leads. Shared by
 * import-n9-list.mjs (one real daily file) and import-n9-from-xlsx.mjs
 * (several days' worth split out of one consolidated workbook) so the
 * staging SQL exists in exactly one place. Caller owns the pg client and
 * any outer transaction; this always runs its own begin/commit-or-rollback.
 * Returns the summary object, or null if this exact file was already
 * audited (same sha256). */
export async function applyN9Batch({ client, parsed, sourceFileName, sha256, uploadedBy = "admin", apply }) {
  await client.query("begin");
  try {
    await client.query("select pg_advisory_xact_lock(20261022)");

    const prior = await client.query("select id from n9_imports where file_sha256 = $1", [sha256]);
    if (prior.rowCount) {
      await client.query("rollback");
      return { noop: true, priorImportId: prior.rows[0].id };
    }

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
      [sourceFileName, sha256, uploadedBy, parsed.rows.length, parsed.extractDate],
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

    return {
      noop: false,
      extractDate: parsed.extractDate,
      sourceRows: parsed.sourceRowCount,
      uniqueRows: parsed.rows.length,
      duplicateRows: parsed.duplicateRows,
      matchedInCeLeads: matched.rows[0].count,
    };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }
}
