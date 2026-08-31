// Tiny .env.local loader for standalone node scripts (Next.js loads .env.local
// itself for the app; these one-off scripts run outside Next, so they need this).
import { readFileSync } from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env.local");
let raw;
try {
  raw = readFileSync(envPath, "utf-8");
} catch {
  raw = "";
}

for (const line of raw.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  const value = trimmed.slice(eq + 1).trim();
  if (!(key in process.env)) process.env[key] = value;
}
