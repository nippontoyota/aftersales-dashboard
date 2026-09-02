import { randomUUID } from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function requireEnv() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local for bill PDF storage.");
  }
  return { url: SUPABASE_URL, key: SERVICE_ROLE_KEY };
}

const BUCKET = "bills";

export async function uploadBillPdf(branch: string, originalFileName: string, buffer: Buffer): Promise<string> {
  const { url, key } = requireEnv();
  const month = new Date().toISOString().slice(0, 7);
  const storagePath = `${branch}/${month}/${randomUUID()}.pdf`;

  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${storagePath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/pdf",
      "x-upsert": "false",
    },
    body: new Uint8Array(buffer),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase Storage upload failed (${res.status}): ${body}`);
  }

  return storagePath;
}

export async function getBillPdfSignedUrl(storagePath: string, expiresInSeconds = 3600): Promise<string> {
  const { url, key } = requireEnv();

  const res = await fetch(`${url}/storage/v1/object/sign/${BUCKET}/${storagePath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: expiresInSeconds }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase Storage sign failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return `${url}/storage/v1${data.signedURL}`;
}
