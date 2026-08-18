import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

/**
 * Shared write-guard for mutating API routes (/api/seed, /api/detect).
 *
 * If SEED_ROUTE_TOKEN (or the equivalently-named DETECT_ROUTE_TOKEN) is set,
 * requests must present it as a Bearer token. If no token is configured in the
 * environment, the guard is a no-op (local/dev convenience), matching the
 * existing seed-route behavior.
 *
 * This is NOT end-user authentication — it is a server-to-server / operator
 * guard protecting expensive, destructive Firestore writes from anonymous
 * callers. The dashboard itself is a read-only visualization tool.
 */

function getRequiredToken(envVar: string): string | undefined {
  const token = process.env[envVar];
  return token && token.length > 0 ? token : undefined;
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function requireWriteToken(
  request: Request,
  envVar: "SEED_ROUTE_TOKEN" | "DETECT_ROUTE_TOKEN"
): NextResponse | null {
  const required = getRequiredToken(envVar);
  if (!required) return null; // not configured → allow (dev)

  const authHeader = request.headers.get("authorization");
  const provided = authHeader?.replace(/^Bearer\s+/i, "");
  if (!provided || !safeCompare(provided, required)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
