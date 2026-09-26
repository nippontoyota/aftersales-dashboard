import pg from 'pg';
import "./scripts/load-env.mjs";
const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    await client.connect();
    
    // Check what keys exist in ssrv089 raw_upload_rows
    const sample = await client.query(`
      SELECT row_data
      FROM raw_upload_rows
      WHERE report_type = 'ssrv089'
      LIMIT 1
    `);

    if (sample.rows.length > 0) {
      console.log('Sample ssrv089 row keys:', Object.keys(sample.rows[0].row_data));
    } else {
      console.log('No ssrv089 rows found');
    }

    // Check for any invoice-number-like column with ASC prefix across all ssrv089 rows
    const ascCheck = await client.query(`
      SELECT DISTINCT
        date, branch, row_index, row_data
      FROM raw_upload_rows
      WHERE report_type = 'ssrv089'
        AND row_data::text ILIKE '%ASC%'
      LIMIT 20
    `);

    console.log('\n--- Rows with ASC in ssrv089 raw data ---');
    console.log('Count:', ascCheck.rows.length);
    for (const row of ascCheck.rows) {
      console.log(`date=${row.date.toISOString().split('T')[0]} branch=${row.branch} row_index=${row.row_index}`);
      console.log('  data:', JSON.stringify(row.row_data));
    }

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
})();
