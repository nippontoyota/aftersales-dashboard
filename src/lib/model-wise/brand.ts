/**
 * Toyota / Alliance / Lexus vehicle-brand classification — Model-wise view
 * (2026-11-21, at the user's request, matching their own manually-built
 * "Toyota-Alliance-Lexus Revenue Split" Excel for Oct/Nov 2026).
 *
 * Classified from Service Info's "Series" column (the vehicle model text),
 * NOT VIN WMI — confirmed against real CO01B Oct 2026 data: VIN WMI alone
 * (JTH/JTJ, the rule ce/vehicle-brand.ts uses for the unrelated CE/conquest
 * dataset) undercounts Lexus by exactly the ES 350H / ES 300H Hybrid rows
 * (57 of CO01B's 120 real Lexus ROs that month), which are registered under
 * the same MBJ VIN prefix ordinary Toyota models use — apparently because
 * the Lexus ES is locally assembled in India, unlike the imported NX/RX/LX/
 * LM models that DO carry a JTJ/JTH VIN. Series text has no such gap: every
 * genuine Lexus model's Series value is its bare model code (e.g. "ES 350H",
 * "NX 350H", "RX Gen5", "LX 450D") or "Lexus "-prefixed (e.g. "Lexus LM"),
 * and none of those codes collides with a real Toyota/Alliance series name
 * (checked against every distinct Series value on file for CO01B, Oct 2026).
 * Reproduced the user's Excel RO counts for CO01B exactly this way: 1,705
 * Toyota / 1,072 Alliance / 120 Lexus.
 *
 * Alliance = the known Suzuki-sourced rebadges sold under the Toyota badge
 * in India — same model list vas-series-map.ts already uses for TGLOSS
 * pricing (Glanza, Taisor, Urban Cruiser incl. Ebella, Urban Cruiser
 * Hyryder, Rumion). Everything else is Toyota.
 */
export type VehicleBrand = "toyota" | "alliance" | "lexus";
export const VEHICLE_BRANDS: VehicleBrand[] = ["toyota", "alliance", "lexus"];

const LEXUS_SERIES_WORDS = new Set(["ES", "NX", "RX", "LX", "LM", "LC"]);
const ALLIANCE_SERIES_WORDS = new Set(["HYRYDER", "GLANZA", "TAISOR", "EBELLA", "RUMION"]);

function seriesWords(series: string): Set<string> {
  return new Set(
    series
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
  );
}

export function classifyBrandFromSeries(series: string): VehicleBrand {
  const words = seriesWords(series);
  for (const word of words) if (LEXUS_SERIES_WORDS.has(word)) return "lexus";
  for (const word of words) if (ALLIANCE_SERIES_WORDS.has(word)) return "alliance";
  // "Urban Cruiser" alone (no Hyryder/Taisor/Ebella suffix already matched
  // above) — same two-word check as vas-series-map.ts's seriesToSize.
  if (words.has("URBAN") && words.has("CRUISER")) return "alliance";
  return "toyota";
}
