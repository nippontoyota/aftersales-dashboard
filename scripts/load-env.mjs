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

// Values can span multiple lines when wrapped in double quotes (e.g.
// DATABASE_CA_CERT's PEM block) — keep consuming lines until the closing
// quote instead of treating each line independently.
const lines = raw.split("\n");
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if (value.startsWith('"') && !(value.length > 1 && value.endsWith('"'))) {
    while (i + 1 < lines.length) {
      i++;
      value += "\n" + lines[i];
      if (lines[i].trimEnd().endsWith('"')) break;
    }
  }
  if (value.startsWith('"') && value.endsWith('"') && value.length > 1) {
    value = value.slice(1, -1);
  }
  if (!(key in process.env)) process.env[key] = value;
}
