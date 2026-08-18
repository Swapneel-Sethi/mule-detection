import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Server-side proxy for /api/detect.
 * Injects DETECT_ROUTE_TOKEN so the browser never sees the secret.
 */
export async function POST() {
  const token = process.env.DETECT_ROUTE_TOKEN;
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  try {
    const res = await fetch(`${baseUrl}/api/detect`, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("Detect proxy error:", error);
    return NextResponse.json({ error: "Detection request failed" }, { status: 500 });
  }
}
