import { NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebaseAdmin";
import { alerts as mockAlerts } from "@/lib/mockData";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getFirestoreAdmin();
    const snap = await db.collection("alerts").where("status", "in", ["new", "investigating"]).get();
    return NextResponse.json({ count: snap.size });
  } catch {
    const activeCount = mockAlerts.filter(
      (a) => a.status === "new" || a.status === "investigating"
    ).length;
    return NextResponse.json({ count: activeCount || 5 });
  }
}
