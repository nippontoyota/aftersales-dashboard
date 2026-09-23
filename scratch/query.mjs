import { Client } from "pg";
import "../scripts/load-env.mjs";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  
  const amounts = [
    5036.48, 5943.00,
    21552.56, 25432.00,
    2899.10, 3421.00,
    15894.98, 18756.00,
    18289.82, 21582.00,
    21291.46, 25124.00,
    18289.82, 21582.00,
    32.22, 38.00,
    12471.26, 14716.00,
    12741.10, 17436.00,
    8646.10, 13341.00,
    8994.02, 10613.00
  ];
  
  const jobOrders = [
    "GSJ26-12718", "GSJ26-12816", "GSJ26-11373", "GSJ26-11347",
    "GSJ26-13178", "GSJ26-13188", "GSJ26-13327", "GSJ26-13401",
    "GSJ26-13608", "GSJ26-11587", "GSJ26-13832",
    // without dash just in case
    "GSJ2612718", "GSJ2612816", "GSJ2611373", "GSJ2611347",
    "GSJ2613178", "GSJ2613188", "GSJ2613327", "GSJ2613401",
    "GSJ2613608", "GSJ2611587", "GSJ2613832"
  ];
  
  try {
    const { rows } = await client.query(`
      SELECT date, branch, row_data 
      FROM raw_upload_rows 
      WHERE branch = 'KT01A' 
      AND report_type = 'ssrv089'
    `);
    
    console.log(`Found ${rows.length} rows for KT01A ssrv089`);
    
    for (const row of rows) {
      const rowData = row.row_data;
      const totalSale = rowData["Total Sale"];
      const totalCost = rowData["Total Cost"];
      const jobOrder = rowData["JobOrder No"];
      
      let matched = false;
      let reason = "";
      
      if (amounts.includes(totalSale)) {
        matched = true;
        reason += `Total Sale matched ${totalSale}. `;
      }
      if (amounts.includes(totalCost)) {
        matched = true;
        reason += `Total Cost matched ${totalCost}. `;
      }
      if (jobOrder && jobOrders.includes(jobOrder)) {
        matched = true;
        reason += `JobOrder matched ${jobOrder}. `;
      }
      
      if (matched) {
        console.log(`\nMatch found on ${row.date.toISOString().split('T')[0]}: ${reason}`);
        console.log(JSON.stringify(rowData, null, 2));
      }
    }
    
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.end();
  }
}

main();
