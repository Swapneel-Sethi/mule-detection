import { NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebaseAdmin";
import type { Transaction } from "@/lib/detectionEngine";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const flaggedOnly = searchParams.get("flagged") === "true";

    const db = await getFirestoreAdmin();
    let query = db.collection("transactions").limit(500);
    if (flaggedOnly) {
      // 'flagged' is set by the detection engine on detection runs
      query = query.where("flagged", "==", true);
    }
    const snap = await query.get();

    const transactions: Transaction[] = snap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<Transaction, "id">),
    }));

    return NextResponse.json({ transactions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
