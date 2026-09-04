import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse bundles pdfjs-dist + the native @napi-rs/canvas addon. Let Node
  // require them at runtime instead of having the bundler inline them — the
  // bundled copy triggered "ReferenceError: DOMMatrix is not defined" on Vercel
  // and can't load the native canvas binary. Polyfills still apply via the
  // "./pdf-polyfill" import in src/lib/bill/parse.ts.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  // The pdf.js worker is loaded via a dynamic import that file tracing can't
  // resolve; force it into the bill-upload function's bundle.
  outputFileTracingIncludes: {
    "/api/upload/bill": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
  experimental: {
    // proxy.ts runs on every request and Next.js buffers the whole body in
    // memory so both proxy and the route handler can read it — capped at
    // 10MB by default. A real Service Info Report export can run to several
    // thousand rows (found 2026-09-01, correcting historical VAS revenue:
    // one real branch's file was already 8.3MB, and others in the same
    // batch exceeded 10MB outright, silently truncating to a malformed
    // request). 50MB gives real exports real headroom.
    proxyClientMaxBodySize: "50mb",
  },
};

export default nextConfig;
