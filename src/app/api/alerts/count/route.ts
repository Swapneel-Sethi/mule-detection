import { NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getFirestoreAdmin();
    const snap = await db.collection("alerts").where("status", "in", ["new", "investigating"]).get();
    return NextResponse.json({ count: snap.size });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
