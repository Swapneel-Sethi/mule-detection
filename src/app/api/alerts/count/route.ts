import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";

// Active-alert counter for badge-style consumers. "Active" mirrors the
// stats.activeAlerts definition in /api/data-local (status new or
// investigating) so every surface reports the same number. Read/parse
// failures answer 500 — never a 200 {count:0}, which would masquerade as an
// all-clear during an outage.
const ALERTS_PATH = join(process.cwd(), "public", "alerts_synthetic.json");

function isActive(status: unknown): boolean {
  const normalized = String(status || "").toLowerCase();
  return normalized === "new" || normalized === "investigating";
}

export async function GET() {
  try {
    const raw = await readFile(ALERTS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>[];
    // An empty or non-array artifact is a corrupt/partial write, not an empty
    // alert set — same policy as /api/data-local's loader.
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("alerts dataset is empty or not an array");
    }
    const count = parsed.filter((alert) => isActive(alert.status)).length;
    return NextResponse.json(
      { count },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: unknown) {
    // Log details server-side; never leak internal error text to clients.
    console.error("[api/alerts/count] failed to load alerts:", error);
    return NextResponse.json(
      { error: "Failed to load alerts" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
