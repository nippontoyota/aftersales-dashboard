import * as XLSX from "xlsx";
import { readFileSync, writeFileSync } from "node:fs";

const buf = readFileSync(String.raw`C:\Users\Nippon\Downloads\VAS July 26 PL-Service.xlsx`);
const wb = XLSX.read(buf, { type: "buffer" });

function extract(sheetName) {
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const list = [];
  for (let i = 3; i < rows.length; i++) {
    const row = rows[i];
    const jobCode = row[0];
    if (!jobCode) continue;
    const clean = (v) => (v === "" || v === 0 ? null : Number(v));
    list.push({
      jobCode: String(jobCode).trim(),
      category: String(row[1]).trim(),
      name: String(row[2]).replace(/\s+/g, " ").trim(),
      small: clean(row[6]),
      medium: clean(row[13]),
      large: clean(row[20]),
      xl: clean(row[27]),
    });
  }
  return list;
}

const tierA = extract("co01b"); // Tier A representative — verified identical across every Tier A branch
const tierB = extract("kt01a"); // Tier B representative — verified identical across every Tier B branch
const tierBMap = new Map(tierB.map((r) => [r.jobCode, r]));

const combined = tierA.map((a) => {
  const b = tierBMap.get(a.jobCode);
  return {
    jobCode: a.jobCode,
    category: a.category,
    name: a.name,
    tierA: { small: a.small, medium: a.medium, large: a.large, xl: a.xl },
    tierB: b ? { small: b.small, medium: b.medium, large: b.large, xl: b.xl } : { small: null, medium: null, large: null, xl: null },
  };
});

const header = `/**
 * T-Gloss / Lexus VAS treatment price list — master reference data.
 *
 * Sourced from "VAS July 26 PL-Service.xlsx" (2026-08-31), one row per
 * treatment job code, with the retail price for each vehicle size class,
 * split by city tier (see branch-tier.ts). Tier A prices are read from
 * co01b's own sheet, Tier B from kt01a's own sheet — verified byte-identical
 * across every branch within each tier — rather than the workbook's
 * "Summary VALO"/"Summary oplnt" roll-up tabs, whose retail prices didn't
 * quite match what's actually in each branch's own sheet (confirmed with
 * the user, e.g. kt01a's own Medium price of Rs 1,233 vs Summary oplnt's Rs
 * 1,226 for the same treatment). Confirmed correct by the user 2026-08-31 —
 * see the "T-Gloss Price List" artifact. Update this file (regenerate via
 * scripts/gen-vas-price-list.mjs) only when the user brings a revised sheet.
 *
 * null means that size class isn't offered for the treatment (nine
 * Lexus-only treatments price at Ex. Large only).
 */

export type VasSize = "small" | "medium" | "large" | "xl";

export type VasTreatmentPrice = {
  jobCode: string;
  category: string;
  name: string;
  tierA: Record<VasSize, number | null>;
  tierB: Record<VasSize, number | null>;
};

export const VAS_PRICE_LIST: VasTreatmentPrice[] = ${JSON.stringify(combined, null, 2)};

export const VAS_PRICE_BY_JOB_CODE: Map<string, VasTreatmentPrice> = new Map(VAS_PRICE_LIST.map((t) => [t.jobCode, t]));
`;

writeFileSync("src/lib/vas-price-list.ts", header);
console.log("Wrote src/lib/vas-price-list.ts with", combined.length, "treatments");
