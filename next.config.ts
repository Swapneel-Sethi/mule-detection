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
            // No `preload`: listing submission is effectively irreversible and
            // hasn't happened for this domain; the directive is inert until then.
            value: "max-age=63072000; includeSubDomains",
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; " +
              // NOTE: 'unsafe-eval' is required by plotly.js at runtime;
              // 'unsafe-inline' is required by Next.js inline bootstrap
              // scripts. Migrating to a nonce-based script-src requires
              // runtime-verifying plotly without 'unsafe-eval' (deferred).
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
              "style-src 'self' 'unsafe-inline'; " +
              "img-src 'self' data:; " +
              "font-src 'self' data:; " +
              // All data fetching is same-origin (/api/*); re-add explicit
              // hosts here if a client-side SDK ever talks to a third party.
              "connect-src 'self'; " +
              "frame-ancestors 'none'; " +
              // Neither base-uri nor form-action inherits from default-src;
              // without them, <base> injection and cross-origin form-action
              // exfiltration stay unrestricted if any XSS lands.
              "base-uri 'self'; " +
              "form-action 'self'; " +
              "object-src 'none';",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), " +
              "payment=(), id=(), browsing-topics=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
