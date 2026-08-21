// MuleGuard Feedback Loop API
// Inspired by DAN Framework — learns from analyst confirmations
// Stores feedback for model calibration and continuous improvement

import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebaseAdmin";
import { requireWriteToken } from "@/lib/apiAuth";

interface FeedbackEntry {
  account_id: string;
  alert_id?: string;
  confirmed: boolean; // true = confirmed mule, false = false positive
  analyst_id: string;
  timestamp: string;
  notes?: string;
  risk_score_at_feedback: number;
  features_at_feedback: Record<string, number | boolean>;
}

/**
 * Auth guard: tries FEEDBACK_ROUTE_TOKEN first (least-privilege),
 * falls back to SEED_ROUTE_TOKEN for backward compatibility.
 */
function requireFeedbackAuth(request: Request): NextResponse | null {
  const feedbackErr = requireWriteToken(request, "FEEDBACK_ROUTE_TOKEN");
  if (!feedbackErr) return null;
  // Fall back to SEED_ROUTE_TOKEN if FEEDBACK_ROUTE_TOKEN not configured
  if (process.env.FEEDBACK_ROUTE_TOKEN) return feedbackErr;
  return requireWriteToken(request, "SEED_ROUTE_TOKEN");
}

// POST /api/feedback — Submit feedback for an account/alert
export async function POST(request: NextRequest) {
  const authError = requireFeedbackAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const {
      account_id,
      alert_id,
      confirmed,
      analyst_id = "analyst_1",
      notes,
      risk_score_at_feedback,
      features_at_feedback,
    } = body;

    if (!account_id || typeof confirmed !== "boolean") {
      return NextResponse.json(
        { error: "account_id and confirmed (boolean) are required" },
        { status: 400 }
      );
    }

    const db = await getFirestoreAdmin();

    // Store feedback entry
    const feedbackEntry: FeedbackEntry = {
      account_id,
      alert_id,
      confirmed,
      analyst_id,
      timestamp: new Date().toISOString(),
      notes,
      risk_score_at_feedback: risk_score_at_feedback ?? 0,
      features_at_feedback: features_at_feedback ?? {},
    };

    await db.collection("feedback").add(feedbackEntry);

    // Update the account's feedback status
    const accountRef = db.collection("accounts").doc(account_id);
    const accountDoc = await accountRef.get();

    if (accountDoc.exists) {
      const accountData = accountDoc.data()!;
      const previousFeedback = accountData.feedback_count ?? 0;
      const previousConfirmed = accountData.feedback_confirmed ?? 0;

      await accountRef.set(
        {
          feedback_count: previousFeedback + 1,
          feedback_confirmed: previousConfirmed + (confirmed ? 1 : 0),
          last_feedback: new Date().toISOString(),
          feedback_outcome: confirmed ? "confirmed_mule" : "false_positive",
        },
        { merge: true }
      );

      // Update alert if provided
      if (alert_id) {
        const alertRef = db.collection("alerts").doc(alert_id);
        await alertRef.set(
          {
            status: confirmed ? "confirmed" : "dismissed",
            feedback_timestamp: new Date().toISOString(),
            feedback_notes: notes,
          },
          { merge: true }
        );
      }

      // Compute running false positive rate for monitoring
      const feedbackSnapshot = await db
        .collection("feedback")
        .where("account_id", "==", account_id)
        .get();

      let totalFeedback = 0;
      let confirmedCount = 0;
      feedbackSnapshot.forEach((doc) => {
        totalFeedback++;
        if (doc.data().confirmed) confirmedCount++;
      });

      const confirmationRate = totalFeedback > 0 ? confirmedCount / totalFeedback : 0;

      return NextResponse.json({
        success: true,
        account_id,
        feedback_recorded: true,
        confirmation_rate: Math.round(confirmationRate * 1000) / 1000,
        total_feedback: totalFeedback,
      });
    }

    return NextResponse.json({
      success: true,
      account_id,
      feedback_recorded: true,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET /api/feedback — Get feedback summary/statistics
export async function GET(request: NextRequest) {
  const authError = requireFeedbackAuth(request);
  if (authError) return authError;

  try {
    const db = await getFirestoreAdmin();
    const url = new URL(request.url);
    const accountId = url.searchParams.get("account_id");

    if (accountId) {
      // Get feedback for specific account
      const feedbackSnapshot = await db
        .collection("feedback")
        .where("account_id", "==", accountId)
        .orderBy("timestamp", "desc")
        .limit(50)
        .get();

      const feedback = feedbackSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return NextResponse.json({ account_id: accountId, feedback });
    }

    // Global feedback statistics
    const allFeedback = await db.collection("feedback").limit(1000).get();
    let totalEntries = 0;
    let confirmedMules = 0;
    let falsePositives = 0;
    const analystCounts: Record<string, number> = {};

    allFeedback.forEach((doc) => {
      const data = doc.data();
      totalEntries++;
      if (data.confirmed) confirmedMules++;
      else falsePositives++;
      analystCounts[data.analyst_id] = (analystCounts[data.analyst_id] ?? 0) + 1;
    });

    const falsePositiveRate = totalEntries > 0
      ? falsePositives / totalEntries
      : 0;

    return NextResponse.json({
      total_feedback: totalEntries,
      confirmed_mules: confirmedMules,
      false_positives: falsePositives,
      false_positive_rate: Math.round(falsePositiveRate * 1000) / 1000,
      confirmation_rate: totalEntries > 0
        ? Math.round((confirmedMules / totalEntries) * 1000) / 1000
        : 0,
      by_analyst: analystCounts,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
