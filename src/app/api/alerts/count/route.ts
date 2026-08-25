import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";

// Active-alert count (status new or investigating). Standalone public stat —
// no page consumes it today. Cached in-process for 60s (the underlying dataset
// is static per deployment); failures are negatively cached for the same
// window so an outage cannot turn every request into a re-read.
const CACHE_TTL_MS = 60_000;
let cache: { count: number; at: number } | null = null;
let failedAt = 0;

export async function GET() {
  let fresh = false;
  try {
    fresh = cache !== null && Date.now() - cache.at <= CACHE_TTL_MS;
    const failFresh = Date.now() - failedAt <= CACHE_TTL_MS;
    if (!fresh && !failFresh) {
      const raw = await readFile(
        join(process.cwd(), "public", "alerts_synthetic.json"),
        "utf-8"
      );
      const alerts = JSON.parse(raw) as Array<{ status?: string }>;
      const count = alerts.filter((a) => {
        const s = String(a.status || "").toLowerCase();
        return s === "new" || s === "investigating";
      }).length;
      cache = { count, at: Date.now() };
      fresh = true;
    }
  } catch (error: unknown) {
    // Log details server-side. Report failure honestly: serve the last good
    // count marked stale, or 503 when none exists — never masquerade a read
    // failure as "no active alerts".
    console.error("[api/alerts/count] refresh failed:", error);
    failedAt = Date.now();
    if (cache) {
      return NextResponse.json(
        { count: cache.count, stale: true },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(
      { error: "Alert dataset unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (cache) {
    // no-store: the in-process cache above is the single source of freshness,
    // so neither browsers nor CDNs may serve a stale copy.
    return NextResponse.json(
      fresh ? { count: cache.count } : { count: cache.count, stale: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
  // Reachable only while a recent failure is negatively cached and no good
  // count exists yet.
  return NextResponse.json(
    { error: "Alert dataset unavailable" },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  );
}
