import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import XLSX from "xlsx";
import "./load-env.mjs";
import { normalizeCeVin, normalizeIndianMobile } from "../src/lib/ce/dms.mjs";

// One-off import for a fresh TKM UIO export that does NOT match the
// reformatted CE_HEADERS shape the live /data upload form expects (see
// src/lib/ce/parse.ts) — this is the raw TKM column layout instead
// (VIN_NO, ZONE, CUST_MOB_NO_1/2, "Inactive Detail", etc., no customer
// name columns at all). Analysis done 2026-11-02 against "1_Nippon
// UIO_2025 from TKM.xlsx"'s Sheet4 (88,408 rows, the full export — the
// other sheets are pre-filtered inactive-tier views plus a pivot
// summary): 72,068 VINs already match ce_leads, 16,340 are genuinely
// new (mostly inactive >1-2yrs, 99.8% with a usable mobile number, only
// 105 ever seen in our own service_info history), and 1,349 of the
// already-known VINs currently have no contact_number but this file
// can supply one. See project_mrs_n9_system.md.
//
// This script does two things in one pass, mirroring import-ce-dms.mjs's
// stage-then-merge shape:
//   1. INSERT the genuinely new VINs as new ce_leads rows (no customer
//      name available in this file — left blank, same "Unnamed" fallback
//      the UI already uses elsewhere).
//   2. UPDATE contact_number for existing VINs that currently have none.
// It never archives, never overwrites a non-blank field on an existing
// row (other than the one-time contact_number fill), and never touches
// `active`/n-report-date history for already-known vehicles.

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const positional = args.filter((arg) => arg !== "--apply");
if (positional.length !== 1 || args.some((arg) => arg.startsWith("--") && arg !== "--apply")) {
  throw new Error("Usage: node scripts/import-uio-refresh.mjs <workbook.xlsx> [--apply]");
}

const sourcePath = path.resolve(positional[0]);
if (!sourcePath.toLowerCase().endsWith(".xlsx")) throw new Error("The source must be an .xlsx workbook.");
const buffer = readFileSync(sourcePath);
const sha256 = createHash("sha256").update(buffer).digest("hex");
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

const REQUIRED_HEADERS = [
  "AlloatedDealer", "ZONE", "VIN_NO", "SALE_DLR_CD", "Sales_Date", "UIOYear",
  "Sales Branch Code", "N Dealer Code", "N Report Date", "N Mileage",
  "N-1 Dealer Code", "N-1 Report Date", "N-1 Mileage",
  "N-2 Dealer Code", "N-2 Mileage", "N-2 Report Date",
];

function dateOnly(value) {
  if (value === null || value === undefined || value === "") return null;
  let year, month, day;
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    ({ y: year, m: month, d: day } = parsed);
  } else {
    const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    [, year, month, day] = match.map(Number);
  }
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function requiredDate(value, rowNumber, label) {
  const parsed = dateOnly(value);
  if (!parsed) throw new Error(`Row ${rowNumber}: ${label} must be a valid date.`);
  if (parsed > today) throw new Error(`Row ${rowNumber}: ${label} ${parsed} is in the future.`);
  return parsed;
}

function requiredNumber(value, rowNumber, label) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(parsed)) throw new Error(`Row ${rowNumber}: ${label} must be numeric.`);
  return parsed;
}

const workbook = XLSX.read(buffer, { type: "buffer" });
const sheetName = workbook.SheetNames.includes("Sheet4") ? "Sheet4" : workbook.SheetNames[workbook.SheetNames.length - 1];
const raw = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null, raw: true });
for (const header of REQUIRED_HEADERS) {
  if (!(header in (raw[0] ?? {}))) throw new Error(`Sheet "${sheetName}" is missing required column "${header}".`);
}

const byVin = new Map();
let blankVin = 0;
let neverVisited = 0;
const records = [];
for (let index = 0; index < raw.length; index++) {
  const source = raw[index];
  const rowNumber = index + 2; // header row + 1-based
  const vin = normalizeCeVin(source["VIN_NO"] ?? source["VIN"]);
  if (!vin) { blankVin++; continue; }
  if (byVin.has(vin)) continue; // keep first occurrence, same as the analysis pass
  byVin.set(vin, true);
  // A vehicle with no N-visit at all (never serviced with us, not even
  // once) has nothing to anchor ceDueDate()'s "months/km since last
  // visit" off of, and ce_leads.n_report_date/n_mileage are NOT NULL —
  // skip rather than fabricate a visit from Sales_Date. Rare (65/88,408
  // rows as of the 2026-11-02 file) — see project_mrs_n9_system.md.
  if (!source["N Report Date"] || source["N Mileage"] === null || source["N Mileage"] === "") { neverVisited++; continue; }

  const n1ReportDate = dateOnly(source["N-1 Report Date"]);
  const n1Mileage = source["N-1 Mileage"] === null || source["N-1 Mileage"] === "" ? null : requiredNumber(source["N-1 Mileage"], rowNumber, "N-1 Mileage");
  const nMileage = requiredNumber(source["N Mileage"], rowNumber, "N Mileage");

  records.push({
    vin,
    allocated_dealer: String(source["AlloatedDealer"] ?? "").trim(),
    dealer_zone: String(source["ZONE"] ?? "").trim(),
    sale_dealer_code: String(source["SALE_DLR_CD"] ?? "").trim(),
    sales_date: requiredDate(source["Sales_Date"], rowNumber, "Sales_Date"),
    uio_year: Math.trunc(requiredNumber(source["UIOYear"], rowNumber, "UIOYear")),
    sale_branch_code: String(source["Sales Branch Code"] ?? "").trim(),
    n_dealer_code: String(source["N Dealer Code"] ?? "").trim(),
    n_report_date: requiredDate(source["N Report Date"], rowNumber, "N Report Date"),
    n_mileage: nMileage,
    n1_dealer_code: String(source["N-1 Dealer Code"] ?? "").trim() || null,
    n1_report_date: n1ReportDate,
    n1_mileage: n1Mileage,
    n2_dealer_code: String(source["N-2 Dealer Code"] ?? "").trim() || null,
    n2_mileage: source["N-2 Mileage"] === null || source["N-2 Mileage"] === "" ? null : requiredNumber(source["N-2 Mileage"], rowNumber, "N-2 Mileage"),
    n2_report_date: dateOnly(source["N-2 Report Date"]),
    avf: n1Mileage !== null ? (nMileage - n1Mileage) / 10_000 : null,
    contact_number:
      normalizeIndianMobile(source["CUST_MOB_NO_1"]) ??
      normalizeIndianMobile(source["CUST_MOB_NO_2"]) ??
      normalizeIndianMobile(source["CUST_TEL_NO_1"]) ??
      normalizeIndianMobile(source["CUST_TEL_NO_2"]) ??
      normalizeIndianMobile(source["CUST_TEL_NO_3"]),
  });
}
console.log(`Parsed ${raw.length} rows from "${sheetName}": ${records.length} usable distinct VINs, ${raw.length - blankVin - neverVisited - records.length} intra-sheet duplicate VINs skipped, ${blankVin} blank-VIN rows skipped, ${neverVisited} never-visited (no N Report Date/Mileage) rows skipped.`);

const minReportDate = records.map((r) => r.n_report_date).sort()[0];
const maxReportDate = records.map((r) => r.n_report_date).sort().at(-1);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}.`);
}

try {
  await client.query("begin");
  await client.query("select pg_advisory_xact_lock(20261102)");

  const prior = await client.query("select id from ce_lead_imports where file_sha256 = $1", [sha256]);
  if (prior.rowCount) {
    await client.query("rollback");
    console.log(`UIO refresh: no-op (this file is already audited as import ${prior.rows[0].id}).`);
    process.exitCode = 0;
  } else {
    await client.query(`
      create temp table uio_refresh_stage (
        vin text primary key, allocated_dealer text, dealer_zone text, sale_dealer_code text,
        sales_date date not null, uio_year int not null, sale_branch_code text, n_dealer_code text,
        n_report_date date not null, n_mileage numeric not null,
        n1_dealer_code text, n1_report_date date, n1_mileage numeric,
        n2_dealer_code text, n2_mileage numeric, n2_report_date date,
        avf numeric, contact_number text
      ) on commit drop
    `);

    const chunkSize = 2_000;
    for (let start = 0; start < records.length; start += chunkSize) {
      const chunk = records.slice(start, start + chunkSize);
      await client.query(
        `insert into uio_refresh_stage
         select * from jsonb_to_recordset($1::jsonb) as r(
           vin text, allocated_dealer text, dealer_zone text, sale_dealer_code text,
           sales_date date, uio_year int, sale_branch_code text, n_dealer_code text,
           n_report_date date, n_mileage numeric,
           n1_dealer_code text, n1_report_date date, n1_mileage numeric,
           n2_dealer_code text, n2_mileage numeric, n2_report_date date,
           avf numeric, contact_number text
         )`,
        [JSON.stringify(chunk)],
      );
    }

    const staged = await client.query("select count(*)::int count from uio_refresh_stage");
    assertEqual(staged.rows[0].count, records.length, "Staged row count");

    await client.query("create temp table uio_refresh_active_before on commit drop as select vin, active from ce_leads");
    await client.query("create temp table uio_refresh_workflow_before on commit drop as select * from ce_lead_workflow");

    const before = await client.query(`
      select
        (select count(*)::int from uio_refresh_stage s left join ce_leads l using (vin) where l.vin is null) new_vins,
        (select count(*)::int from uio_refresh_stage s join ce_leads l using (vin)
           where coalesce(l.contact_number, '') = '' and s.contact_number is not null) enrichable
    `);

    const audit = await client.query(
      `insert into ce_lead_imports
       (source_file_name, import_kind, file_sha256, uploaded_by, row_count, min_report_date, max_report_date)
       values ($1, 'uio', $2, 'admin', $3, $4, $5) returning id`,
      [path.basename(sourcePath), sha256, records.length, minReportDate, maxReportDate],
    );
    const importId = audit.rows[0].id;

    await client.query(
      `update ce_leads l set contact_number = s.contact_number
       from uio_refresh_stage s
       where l.vin = s.vin and coalesce(l.contact_number, '') = '' and s.contact_number is not null`,
    );

    await client.query(
      `insert into ce_leads (
         allocated_dealer, dealer_zone, vin, sale_dealer_code, sales_date, uio_year,
         sale_branch_code, n_dealer_code, avf, n_report_date, n_mileage,
         n1_dealer_code, n1_report_date, n1_mileage, n2_dealer_code, n2_mileage,
         n2_report_date, customer_first_name, customer_family_name, contact_number,
         vehicle_model, active, source_import_id, imported_at
       )
       select s.allocated_dealer, s.dealer_zone, s.vin, s.sale_dealer_code, s.sales_date, s.uio_year,
         s.sale_branch_code, s.n_dealer_code, s.avf, s.n_report_date, s.n_mileage,
         s.n1_dealer_code, s.n1_report_date, s.n1_mileage, s.n2_dealer_code, s.n2_mileage,
         s.n2_report_date, '', '', s.contact_number,
         null, true, $1, now()
       from uio_refresh_stage s left join ce_leads l using (vin)
       where l.vin is null`,
      [importId],
    );
    await client.query(`insert into ce_lead_workflow (vin) select vin from ce_leads where active on conflict (vin) do nothing`);

    const validation = await client.query(`
      select
        (select count(*)::int from uio_refresh_active_before b join ce_leads l using (vin) where b.active and not l.active) archived,
        (select count(*)::int from uio_refresh_workflow_before b join ce_lead_workflow w using (vin)
          where row(b.status, b.next_follow_up_date, b.attempt_count, b.latest_call_status, b.latest_outcome, b.last_editor, b.updated_at)
          is distinct from row(w.status, w.next_follow_up_date, w.attempt_count, w.latest_call_status, w.latest_outcome, w.last_editor, w.updated_at)) workflow_changes,
        (select count(*)::int from ce_leads l left join ce_lead_workflow w using (vin) where l.active and w.vin is null) active_without_workflow,
        (select count(*)::int from ce_leads l join ce_lead_workflow w using (vin) where l.source_import_id = $1 and (w.status <> 'New' or w.attempt_count <> 0)) invalid_new_workflows,
        (select count(*)::int from ce_leads where source_import_id = $1) actually_inserted
    `, [importId]);

    const result = { ...before.rows[0], ...validation.rows[0] };
    assertEqual(result.archived, 0, "Leads archived by this import");
    assertEqual(result.workflow_changes, 0, "Existing workflow rows changed");
    assertEqual(result.active_without_workflow, 0, "Active leads without workflow");
    assertEqual(result.invalid_new_workflows, 0, "New leads outside F0/New workflow");
    assertEqual(result.actually_inserted, result.new_vins, "Inserted row count vs. detected new VINs");

    if (apply) await client.query("commit");
    else await client.query("rollback");
    console.log(`UIO refresh: ${apply ? "applied" : "dry run"}`);
    console.log({
      sheetRows: raw.length,
      distinctVins: records.length,
      newVinsInserted: result.new_vins,
      contactsEnriched: result.enrichable,
      archived: result.archived,
      importId,
    });
    if (!apply) console.log("No changes committed. Re-run with --apply after reviewing these numbers.");
  }
} catch (error) {
  await client.query("rollback").catch(() => {});
  throw error;
} finally {
  await client.end();
}
