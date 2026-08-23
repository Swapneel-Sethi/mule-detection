import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rateLimit";

// Run the proxy only on API routes (cheap, no-op on pages).
export const config = {
  matcher: ["/api/:path*"],
};

// Per-IP limits per window.
const LIMITS: Record<string, { limit: number; windowMs: number }> = {
  // Data-local is read-only but protect against scraping.
  "/api/data-local": { limit: 120, windowMs: 60_000 },
};

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const rule = LIMITS[pathname] ?? { limit: 120, windowMs: 60_000 };

  const key = `${getClientKey(request)}:${pathname}`;
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