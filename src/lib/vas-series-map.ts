import type { VasSize } from "./vas-price-list";

/**
 * Maps a Service Info Report "Series" value (vehicle model, e.g. "INNOVA
 * HYCROSS", "URBAN CRUISER HYRYDER") to the T-Gloss size class it prices
 * against. Matches whole words, most-specific first — plain substring
 * matching would wrongly catch "CROSS" inside "HYCROSS".
 *
 * Two ambiguities were confirmed with the user 2026-08-31 against the real
 * universe of Series values found across every branch's Service Info Report
 * (8,136 TGLOSS/LEXUS rows): "URBAN CRUISER HYRYDER" (1,310 rows) is the
 * Hyryder (Medium), not the Urban Cruiser (Small); "ETIOS LIVA" (391 rows)
 * and "ETIOS CROSS" (5 rows) are the Liva/Cross hatchbacks (Small), not the
 * base Etios (Medium). Every other Series value found maps unambiguously.
 *
 * Lexus rows don't need this at all — every Lexus job code only has one
 * price (the Ex. Large slot in vas-price-list.ts), so the caller should
 * check that before ever calling this.
 */
const KEYWORD_SIZE: { word: string; size: VasSize }[] = [
  { word: "HYRYDER", size: "medium" },
  { word: "LIVA", size: "small" },
  { word: "HYCROSS", size: "large" },
  { word: "CROSS", size: "small" }, // Etios Cross — checked after HYCROSS so "INNOVA HYCROSS" doesn't false-match
  { word: "GLANZA", size: "small" },
  { word: "TAISOR", size: "small" },
  { word: "EBELLA", size: "small" }, // Urban Cruiser Ebella
  { word: "ETIOS", size: "medium" },
  { word: "YARIS", size: "medium" },
  { word: "RUMION", size: "medium" },
  { word: "COROLLA", size: "medium" },
  { word: "INNOVA", size: "large" },
  { word: "CAMRY", size: "large" },
  { word: "QUALIS", size: "large" },
  { word: "CRYSTA", size: "large" },
  { word: "PRIUS", size: "large" },
  { word: "MIRAI", size: "large" },
  { word: "FORTUNER", size: "xl" },
  { word: "VELLFIRE", size: "xl" },
  { word: "HILUX", size: "xl" },
  { word: "PRADO", size: "xl" },
  { word: "HIACE", size: "xl" },
];

export function seriesToSize(series: string): VasSize | null {
  const words = new Set(
    series
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
  );

  for (const { word, size } of KEYWORD_SIZE) {
    if (words.has(word)) return size;
  }
  // "Urban Cruiser" alone (no Hyryder/Taisor/Ebella suffix already matched above).
  if (words.has("URBAN") && words.has("CRUISER")) return "small";
  // "Land Cruiser" alone (no Prado already matched above — that's still Ex. Large).
  if (words.has("LAND") && words.has("CRUISER")) return "xl";
  return null;
}
