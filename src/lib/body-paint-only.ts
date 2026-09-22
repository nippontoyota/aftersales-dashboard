/**
 * Split out of report.ts (2026-09-22) so client components can check this
 * without pulling in report.ts's server-only DB imports (pg et al.) at
 * module scope — report.ts re-exports both names from here so every
 * existing server-side importer keeps working unchanged.
 */
export const BODY_PAINT_ONLY_BRANCHES: ReadonlySet<string> = new Set(["CO01E", "KL01B", "TR01B"]);

export function isBodyPaintOnly(branch: string): boolean {
  return BODY_PAINT_ONLY_BRANCHES.has(branch);
}
