import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
