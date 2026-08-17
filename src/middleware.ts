import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rateLimit";

// Run middleware only on API routes (cheap, no-op on pages).
export const config = {
  matcher: ["/api/:path*"],
};

// Per-IP limits per window.
const LIMITS: Record<string, { limit: number; windowMs: number }> = {
  // Detection is expensive (Firestore reads + writes) — keep it low.
  "/api/detect": { limit: 10, windowMs: 60_000 },
  // Seed writes a lot of data — strictly limited.
  "/api/seed": { limit: 5, windowMs: 60_000 },
  // Data + transactions are read-only but still protect against scraping.
  "/api/data": { limit: 60, windowMs: 60_000 },
  "/api/transactions": { limit: 60, windowMs: 60_000 },
};

export function middleware(request: NextRequest) {
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
