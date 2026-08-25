import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rateLimit";

// Run the proxy only on API routes (cheap, no-op on pages).
export const config = {
  matcher: ["/api/:path*"],
};

// Per-IP limit applied uniformly to every API route (per window).
const RULE = { limit: 120, windowMs: 60_000 };

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const key = `${getClientKey(request)}:${pathname}`;
  const result = rateLimit(key, RULE.limit, RULE.windowMs);

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
          "X-RateLimit-Limit": String(RULE.limit),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  const response = NextResponse.next();
  response.headers.set("X-RateLimit-Limit", String(RULE.limit));
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));
  return response;
}