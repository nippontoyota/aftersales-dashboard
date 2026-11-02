/** ce_leads has no brand column, and vehicle_model text is NOT a reliable
 * signal — e.g. "ESV" (234 rows) reads like a Lexus ES trim but every one
 * of those VINs is MBJ-prefixed, the same WMI as Innova/Fortuner/etc, and
 * one single "ES 350h" row is also MBJ (a data-entry mislabel on an
 * otherwise-Toyota vehicle). The VIN's WMI (first 3 characters) is the
 * standardized, non-free-text signal: verified against every distinct
 * (vehicle_model, WMI) pair on file (2026-11-02) — every genuine Lexus
 * model (ES/NX/RX/LX/LM/LC, "Lexus "-prefixed or coded) is exclusively
 * JTH or JTJ, and no Toyota model (Camry/Prius/Land Cruiser/Prado/Vellfire
 * included, despite also starting with "JT") ever uses either. */
export const LEXUS_VIN_WMI_PREFIXES = ["JTH", "JTJ"] as const;

export function isLexusVin(vin: string | null | undefined): boolean {
  const upper = (vin ?? "").trim().toUpperCase();
  return LEXUS_VIN_WMI_PREFIXES.some((prefix) => upper.startsWith(prefix));
}

export type CeVehicleBrand = "toyota" | "lexus";
export const CE_VEHICLE_BRANDS: CeVehicleBrand[] = ["toyota", "lexus"];
