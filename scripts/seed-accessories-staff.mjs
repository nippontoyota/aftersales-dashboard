// One-time migration of the hardcoded ACCESSORIES_STAFF list (from
// src/lib/accessories-staff.ts, originally sourced from "2Accessories
// SO.xlsx") into the new accessories_staff table. Safe to re-run — the
// table's (branch, name) unique constraint plus `on conflict do nothing`
// means re-running this just no-ops on rows that already exist.
import { Client } from "pg";
import "./load-env.mjs";

const ACCESSORIES_STAFF = {
  CO01A: ["Aneesh E K", "Prinson Xavier"],
  CO01B: ["Anil N D", "Antony Anoop", "Aneesh K.P.", "Jeeshan V P", "Ansal C K", "Vivek Lal T J", "Sijo M Joy"],
  KY01A: ["Nibu B"],
  MV01A: ["Javad K A", "Prasobh O P"],
  IR01A: ["Denny A B", "Deepak N S"],
  KT01A: ["Jeffin K F", "Prasanth R Shenoy"],
  TI01A: ["Raju K J", "Anoop P M"],
  TI01B: ["Rohithkrishnan K"],
  KT01B: ["Melvin Cyriac"],
  TL01A: ["Sojan K C"],
  TI01C: ["Sudheer P"],
  TR01C: ["Akhil Lal M", "Nijas Nujum"],
  KL01A: ["Aneesh S", "Vipin V P", "Hari S Nampoothiri", "Nowfal T", "Ranjith S"],
  PH01A: ["Shibu Thomas", "Santhosh V M"],
  TR01A: ["Jijo Valsan", "Ratheeshkumar M T", "Roshin B"],
};

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  let inserted = 0;
  for (const [branch, names] of Object.entries(ACCESSORIES_STAFF)) {
    for (const name of names) {
      const { rowCount } = await client.query(
        "insert into accessories_staff (branch, name) values ($1, $2) on conflict (branch, name) do nothing",
        [branch, name]
      );
      if (rowCount > 0) inserted += 1;
    }
  }
  const { rows } = await client.query("select count(*)::int as count from accessories_staff");
  console.log(`Inserted ${inserted} new row(s). Table now has ${rows[0].count} total.`);
} finally {
  await client.end();
}
