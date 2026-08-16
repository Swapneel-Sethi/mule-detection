import { NextResponse } from "next/server";
import { getTransactions, getFlaggedTransactions } from "@/lib/firestore";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const flaggedOnly = searchParams.get("flagged") === "true";

    const transactions = flaggedOnly
      ? await getFlaggedTransactions()
      : await getTransactions(100);

    return NextResponse.json({ transactions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
