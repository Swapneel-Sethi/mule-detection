import { dirname } from "path";
import { fileURLToPath } from "url";
import type { NextConfig } from "next";

// Keep Turbopack anchored to this app even when an ancestor directory happens
// to contain another package-lock.json.
const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Don't advertise the framework version via `X-Powered-By`.
  poweredByHeader: false,
  turbopack: {
    root: projectRoot,
  },
  // Security headers applied to all routes
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; " +
              // NOTE: 'unsafe-eval' is required by plotly.js at runtime;
              // 'unsafe-inline' is required by Next.js inline bootstrap scripts.
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
              "style-src 'self' 'unsafe-inline'; " +
              "img-src 'self' data:; " +
              "font-src 'self' data:; " +
              // All data fetching is same-origin (/api/*); re-add explicit
              // hosts here if a client-side SDK ever talks to a third party.
              "connect-src 'self'; " +
              "frame-ancestors 'none';",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
