import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";

// Active-alert count (status new or investigating). Standalone public stat —
// no page consumes it today. Cached in-process for 60s; the underlying
// dataset is static per deployment.
const CACHE_TTL_MS = 60_000;
let cache: { count: number; at: number } | null = null;

export async function GET() {
  try {
    if (!cache || Date.now() - cache.at > CACHE_TTL_MS) {
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
    }
    // no-store: the in-process cache above is the single source of freshness,
    // so neither browsers nor CDNs may serve a stale copy.
    return NextResponse.json(
      { count: cache.count },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: unknown) {
    // Log details server-side; degrade to a safe zero instead of failing.
    console.error("[api/alerts/count] failed:", error);
    return NextResponse.json(
      { count: 0 },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
