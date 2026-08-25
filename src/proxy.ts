import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey, isIdentifiedClient } from "@/lib/rateLimit";

// Run the proxy only on API routes (cheap, no-op on pages).
export const config = {
  matcher: ["/api/:path*"],
};

// Per-client budgets, applied to ONE pool per client across ALL API routes —
// the key is the client identity alone, not `${ip}:${pathname}`. All API
// routes share the same backend (module-level caches of multi-MB JSON), so
// the meaningful ceiling is total requests per client; per-path keys gave
// each route its own full budget (480/min aggregate for an IP).
//
// Identified clients (TRUST_PROXY=true and a valid IP header reported) get
// the full budget; `anon:` fingerprints (no trusted proxy / no usable IP
// header) get a far smaller one so scripted unidentified callers cannot
// crowd out real users.
const RULE = { limit: 120, windowMs: 60_000 };
const ANON_RULE = { limit: 30, windowMs: 60_000 };

export function proxy(request: NextRequest) {
  const key = getClientKey(request);
  const rule = isIdentifiedClient(key) ? RULE : ANON_RULE;
  const result = rateLimit(key, rule.limit, rule.windowMs);

  if (!result.allowed) {
    return new NextResponse(
      JSON.stringify({
        error: "Too many requests. Please slow down.",
        retryAfter: result.retryAfter,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(result.retryAfter),
          "X-RateLimit-Limit": String(rule.limit),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  const response = NextResponse.next();
  response.headers.set("X-RateLimit-Limit", String(rule.limit));
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));
  return response;
}