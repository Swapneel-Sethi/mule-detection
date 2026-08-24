import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";

// Active-alert count for the Sidebar badge. Cached for 60s — the client
// polls every 30s and the underlying dataset is static.
let cache: { count: number; at: number } | null = null;

export async function GET() {
  try {
    if (!cache || Date.now() - cache.at > 60000) {
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
    return NextResponse.json({ count: cache.count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
