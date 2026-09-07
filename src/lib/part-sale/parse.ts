import * as XLSX from "xlsx";

/**
 * Part Sale Report — one row per part sold. Unlike Service Info Report,
 * this file has no per-row branch column at all ("Branch name" and "Dealer
 * Name" are literally "NIPPON TOYOTA" on every row, dealer-group-wide) —
 * confirmed with the user that this file is still uploaded one-per-branch,
 * and branch/date come entirely from who's uploading and the date picked,
 * same as Service Info Report. Negative Sale Qty rows are returns/credit
 * notes and are confirmed to net against the day's total, not be excluded.
 */
const PART_NO_COLUMN = "PartNo";
const SALE_QTY_COLUMN = "Sale Qty";
const BILL_NO_COLUMN = "BillNo";
const NET_AMNT_COLUMN = "NetAmnt";

const ENGINE_FLUSH_PARTS = ["A-08814-80061", "A-08814-80090"];
const INJECTOR_CLEANER_PARTS = ["A-08813-80100", "A-08813-80019"];
const SYNTHETIC_OIL_PARTS = [
  "L-0888-080073",
  "L-0888-080072",
  "L-0888-080071",
  "L-0888-084724",
  "L-0888-084726",
  "L-0888-084744",
  "L-0888-084746",
];
const BRAKE_CLEANING_SPRAY_PARTS = ["Z-9BCHP-00001"];

/** External Sales: rows billed under an "AA"-prefixed BillNo whose PartNo
 * starts with one of these letters, plus the exact-match SKUs below —
 * confirmed with the user and verified against real AA-billed rows. */
const EXTERNAL_SALES_BILL_PREFIX = "AA";
const EXTERNAL_SALES_PART_PREFIXES = ["D", "L", "Z", "B", "T"];

/** Exact PartNos that count as External Sales on an AA bill even though
 * their prefix ("A") isn't in the list above:
 *   - A-9ADB1-01001                  ADBLUE
 *   - A-9D101-00001 … A-9D112-00012  the 12 DIY detailing consumables
 *     (shampoo, tar remover, liquid wax, dashboard/tyre dresser, glass
 *     cleaner, leather conditioner, microfiber cloth, tissue box, …) —
 *     added 2026-09-04 at the user's request. External Sales only: they do
 *     NOT feed the DIY count/revenue breakdown, which stays on the separate
 *     "D-DIY…" SKU scheme. */
const EXTERNAL_SALES_EXACT_PARTS = new Set([
  "A-9ADB1-01001",
  "A-9D101-00001", "A-9D102-00002", "A-9D103-00003", "A-9D104-00004",
  "A-9D105-00005", "A-9D106-00006", "A-9D107-00007", "A-9D108-00008",
  "A-9D109-00009", "A-9D110-00010", "A-9D111-00011", "A-9D112-00012",
]);

/** DIY — any row whose PartNo starts with "D-DIY" (e.g. "D-DIYRATS053",
 * "D-DIYKLPF001" — rat repellent spray, car perfume, that kind of small
 * retail item), no bill-prefix restriction unlike External Sales. Shown as
 * an additional informational breakdown on the dashboard — confirmed with
 * the user 2026-08-31 that DIY rows also legitimately match the External
 * Sales criteria (AA bill + "D" part prefix) and should keep counting
 * there too; this isn't carved out of that total, just broken out
 * separately alongside it. */
const DIY_PART_PREFIX = "D-DIY";

export type PartSaleCounts = {
  engineFlush: number;
  injectorCleaner: number;
  /** Already divided by 10 — this is litres, not raw Sale Qty. The DMS
   * records these parts' Sale Qty in tenths of a litre (confirmed with the
   * user 2026-09-04; was /100 until then). */
  syntheticOilLtrs: number;
  brakeCleaningSpray: number;
  /** Sum of NetAmnt for the AA-bill/PartNo-prefix filter above — the Part Sale Report side of External Sales (added to BA Tool's SPR External, see report.ts). */
  externalSales: number;
  /** Sum of Sale Qty for DIY rows. */
  diyCount: number;
  /** Sum of NetAmnt for DIY rows. */
  diyRevenue: number;
};

function normalizePart(value: unknown): string {
  return String(value ?? "").trim();
}

function toQty(value: unknown): number {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function isExternalSalesRow(billNo: string, partNo: string): boolean {
  if (!billNo.startsWith(EXTERNAL_SALES_BILL_PREFIX)) return false;
  if (EXTERNAL_SALES_EXACT_PARTS.has(partNo)) return true;
  return EXTERNAL_SALES_PART_PREFIXES.includes(partNo[0]);
}

/** XLSX (zip) starts with "PK\x03\x04"; legacy XLS (OLE2) with D0 CF 11 E0.
 * Anything else we treat as text (CSV) so it can be repaired before parse. */
function looksBinaryWorkbook(buffer: Buffer): boolean {
  return (
    (buffer[0] === 0x50 && buffer[1] === 0x4b) ||
    (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0)
  );
}

/**
 * The DMS "SPRT014" Part Sale Report CSV export wraps every field in double
 * quotes but never escapes a literal `"` that appears *inside* a field —
 * e.g. a part name like `MICROFIBER CLOTH 350GM 16" X 1`. A compliant CSV
 * reader (SheetJS included) then reads that `"` as the end of the field, so
 * every later column on the line shifts and the row usually swallows the
 * next one too. This doubles any such stray quote (`"` → `""`) so the value
 * survives. A well-formed CSV passes through unchanged; only ever run on
 * text (CSV) input, never on a real .xlsx/.xls.
 *
 * Works on a byte-preserving latin1 view so the buffer's real encoding is
 * still SheetJS's to detect afterwards — every char this touches (`"`, `,`,
 * CR, LF) is ASCII, so non-ASCII bytes pass through untouched.
 */
function repairCsvQuotes(buffer: Buffer): Buffer {
  const text = buffer.toString("latin1").replace(/^ï»¿/, ""); // drop UTF-8 BOM
  let out = "";
  let inQuoted = false; // inside a "…"-quoted field
  let atFieldStart = true; // next char begins a fresh field
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!inQuoted) {
      if (atFieldStart && ch === '"') {
        inQuoted = true;
        atFieldStart = false;
      } else {
        atFieldStart = ch === "," || ch === "\r" || ch === "\n";
      }
      out += ch;
      continue;
    }
    if (ch !== '"') {
      out += ch;
      continue;
    }
    const next = text[i + 1];
    if (next === '"') {
      out += '""'; // already-escaped pair, keep as-is
      i++;
    } else if (next === undefined || next === "," || next === "\r" || next === "\n") {
      out += '"'; // legitimate closing quote
      inQuoted = false;
      atFieldStart = next === ",";
    } else {
      out += '""'; // stray literal quote inside the field — escape it
    }
  }
  return Buffer.from(out, "latin1");
}

export type ParsedPartSale = {
  counts: PartSaleCounts;
  /** Every row exactly as read from the file, every column (2026-09-01, at
   * the user's request) — see raw-upload-rows/store.ts. */
  rawRows: Record<string, unknown>[];
};

export function parsePartSaleWorkbook(buffer: Buffer): ParsedPartSale {
  const workbook = XLSX.read(looksBinaryWorkbook(buffer) ? buffer : repairCsvQuotes(buffer), { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  if (rows.length === 0) {
    throw new Error("No rows found — is this a Part Sale Report export?");
  }
  if (!(PART_NO_COLUMN in rows[0]) || !(SALE_QTY_COLUMN in rows[0])) {
    throw new Error(`Expected "${PART_NO_COLUMN}" and "${SALE_QTY_COLUMN}" columns — is this a Part Sale Report export?`);
  }

  let engineFlush = 0;
  let injectorCleaner = 0;
  let syntheticOilRaw = 0;
  let brakeCleaningSpray = 0;
  let externalSales = 0;
  let diyCount = 0;
  let diyRevenue = 0;

  for (const row of rows) {
    const part = normalizePart(row[PART_NO_COLUMN]);
    const qty = toQty(row[SALE_QTY_COLUMN]);
    if (ENGINE_FLUSH_PARTS.includes(part)) engineFlush += qty;
    else if (INJECTOR_CLEANER_PARTS.includes(part)) injectorCleaner += qty;
    else if (SYNTHETIC_OIL_PARTS.includes(part)) syntheticOilRaw += qty;
    else if (BRAKE_CLEANING_SPRAY_PARTS.includes(part)) brakeCleaningSpray += qty;

    const billNo = normalizePart(row[BILL_NO_COLUMN]);
    if (isExternalSalesRow(billNo, part)) {
      externalSales += toQty(row[NET_AMNT_COLUMN]);
    }

    if (part.toUpperCase().startsWith(DIY_PART_PREFIX)) {
      diyCount += qty;
      diyRevenue += toQty(row[NET_AMNT_COLUMN]);
    }
  }

  return {
    counts: {
      engineFlush,
      injectorCleaner,
      syntheticOilLtrs: syntheticOilRaw / 10,
      brakeCleaningSpray,
      externalSales,
      diyCount,
      diyRevenue,
    },
    rawRows: rows,
  };
}
