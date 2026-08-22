#!/usr/bin/env node
/**
 * Firestore CSV Ingestion Script
 * Reads accounts_100k.csv and transactions_1m.csv, computes ML scores,
 * and batch-writes to Firestore.
 *
 * Usage:
 *   node scripts/import-csv-to-firestore.js [--accounts-only] [--sample N]
 *
 * Environment:
 *   FIREBASE_SERVICE_ACCOUNT_KEY  -- JSON blob (from .env.local)
 *   FIRESTORE_ACCOUNTS_LIMIT      -- max accounts to import (default: all)
 *   FIRESTORE_TXNS_LIMIT          -- max transactions to import (default: all)
 */

const fs = require("fs");
const path = require("path");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// CSV Parser (handles quoted fields)
// ---------------------------------------------------------------------------
function parseCSV(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h.trim()] = vals[idx]?.trim() ?? "";
    });
    rows.push(obj);
  }
  return { headers, rows };
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ---------------------------------------------------------------------------
// ML Score (weighted fallback from feature importances)
// ---------------------------------------------------------------------------
function computeMLScore(row) {
  const hubScore = parseFloat(row.hub_score) || 0;
  const ageDays = parseFloat(row.account_age_days) || 0;
  const totalIn = parseFloat(row.total_in_amount) || 0;
  const avgIn = parseFloat(row.avg_in_amount) || 0;
  const outCount = parseFloat(row.out_txn_count) || 0;
  const velocity = parseFloat(row.txn_velocity_per_day) || 0;
  const uniqRecv = parseFloat(row.unique_receivers) || 0;

  const normHub = Math.min(hubScore / 0.001, 1);
  const normAge = 1 - Math.min(ageDays / 3000, 1);
  const normTotalIn = Math.min(totalIn / 500000, 1);
  const normAvgIn = Math.min(avgIn / 50000, 1);
  const normOutCount = Math.min(outCount / 100, 1);
  const normVelocity = Math.min(velocity / 1.0, 1);
  const normUniqRecv = Math.min(uniqRecv / 100, 1);

  const score =
    normHub * 0.882 +
    normAge * 0.00012 +
    normTotalIn * 0.000009 +
    normAvgIn * 0.000006 +
    normOutCount * 0.000004 +
    normVelocity * 0.000004 +
    normUniqRecv * 0.000002;

  return Math.min(Math.max(score * 3, 0), 1);
}

function riskLevel(score) {
  if (score >= 0.75) return "critical";
  if (score >= 0.50) return "high";
  if (score >= 0.25) return "medium";
  return "low";
}

function computeFlags(row) {
  const flags = [];
  const ratio = parseFloat(row.pass_through_ratio) || 0;
  const vel = parseFloat(row.txn_velocity_per_day) || 0;
  const age = parseFloat(row.account_age_days) || 0;
  const hub = parseFloat(row.hub_score) || 0;
  const outCount = parseFloat(row.out_txn_count) || 0;
  const uniqRecv = parseFloat(row.unique_receivers) || 0;

  if (ratio > 0.85 && ratio < 1.15) flags.push("pass_through");
  if (vel > 0.1) flags.push("high_velocity");
  if (age < 90) flags.push("new_account");
  if (hub > 0.0003) flags.push("network_hub");
  if (outCount > 50) flags.push("high_out_degree");
  if (uniqRecv > 30) flags.push("fan_out_suspect");
  const totalIn = parseFloat(row.total_in_amount) || 0;
  if (totalIn > 100000) flags.push("high_value");

  return flags;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function commitWithRetry(batch, label, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await batch.commit();
      return;
    } catch (err) {
      const msg = err?.message || String(err);
      if (msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota") || msg.includes("429")) {
        const wait = Math.min(30000 * attempt, 120000);
        console.log(`  [${label}] Quota hit, waiting ${wait / 1000}s (attempt ${attempt}/${retries})...`);
        await sleep(wait);
      } else {
        throw err;
      }
    }
  }
  throw new Error(`[${label}] Failed after ${retries} retries`);
}

async function main() {
  const args = process.argv.slice(2);
  const accountsOnly = args.includes("--accounts-only");
  const sampleIdx = args.indexOf("--sample");
  const sampleLimit = sampleIdx >= 0 ? parseInt(args[sampleIdx + 1]) : Infinity;
  const startIdx = args.indexOf("--start");
  const startOffset = startIdx >= 0 ? parseInt(args[startIdx + 1]) : 0;
  const limitIdx = args.indexOf("--limit");
  const maxImport = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : Infinity;

  const serviceKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceKey) {
    console.error("FIREBASE_SERVICE_ACCOUNT_KEY not set");
    process.exit(1);
  }

  const { initializeApp, cert, applicationDefault } = require("firebase-admin/app");
  const { getFirestore, FieldValue } = require("firebase-admin/firestore");

  const serviceAccount = JSON.parse(serviceKey);

  const app = initializeApp({
    credential: cert(serviceAccount),
  });
  const db = getFirestore(app);

  // ---- ACCOUNTS ----
  const accountsCSV = path.resolve(__dirname, "../ml_features_100k.csv");
  console.log(`Reading accounts from ${accountsCSV}...`);
  const { rows: accountRows } = parseCSV(accountsCSV);
  const accountsToImport = Math.min(accountRows.length - startOffset, sampleLimit, maxImport);
  const startLine = startOffset;
  console.log(`  ${accountsToImport} accounts to import (from ${startLine} to ${startLine + accountsToImport} of ${accountRows.length} total)`);

  const BANKS = ["SBI", "HDFC", "ICICI", "Axis", "Kotak", "PNB", "BoB", "Canara", "Union", "IDBI"];
  const CITIES = ["Mumbai", "Delhi", "Bangalore", "Chennai", "Kolkata", "Hyderabad", "Pune", "Ahmedabad", "Jaipur", "Lucknow"];
  const PROGRESS_FILE = path.resolve(__dirname, "../import_progress.json");

  let accountBatch = db.batch();
  let accountCount = 0;
  let accountBatches = 0;

  for (let i = startLine; i < startLine + accountsToImport; i++) {
    const row = accountRows[i];
    const mlScore = computeMLScore(row);
    const level = riskLevel(mlScore);
    const flags = computeFlags(row);
    const ageDays = parseInt(row.account_age_days) || 0;
    const isMule = row.is_mule === "True" || row.is_mule === "true";
    const kycFull = row.kyc_status === "FULL";
    const totalIn = parseFloat(row.total_in_amount) || 0;
    const totalOut = parseFloat(row.total_out_amount) || 0;
    const inCount = parseInt(row.in_txn_count) || 0;
    const outCount = parseInt(row.out_txn_count) || 0;

    const docData = {
      account_id: row.account_id,
      name: `Account ${row.account_id}`,
      bank: BANKS[i % BANKS.length],
      city: CITIES[i % CITIES.length],
      account_age_days: ageDays,
      kyc_status: row.kyc_status,
      kycVerified: kycFull,
      account_type: row.account_type,
      is_mule: isMule,
      risk_score: Math.round(mlScore * 1000) / 10,
      risk_level: level,
      riskLevel: level,
      riskScore: Math.round(mlScore * 1000) / 10,
      flags: flags,
      status: isMule ? "under_review" : "active",
      in_txn_count: inCount,
      unique_senders: parseInt(row.unique_senders) || 0,
      total_in_amount: totalIn,
      avg_in_amount: parseFloat(row.avg_in_amount) || 0,
      out_txn_count: outCount,
      unique_receivers: parseInt(row.unique_receivers) || 0,
      total_out_amount: totalOut,
      avg_out_amount: parseFloat(row.avg_out_amount) || 0,
      pass_through_ratio: parseFloat(row.pass_through_ratio) || 0,
      txn_velocity_per_day: parseFloat(row.txn_velocity_per_day) || 0,
      pagerank: parseFloat(row.pagerank) || 0,
      hub_score: parseFloat(row.hub_score) || 0,
      authority_score: parseFloat(row.authority_score) || 0,
      inDegree: parseInt(row.unique_senders) || 0,
      outDegree: parseInt(row.unique_receivers) || 0,
      totalTransactions: inCount + outCount,
      totalAmount: totalIn + totalOut,
      turnover: totalIn + totalOut,
      balance: totalIn - totalOut,
      behavioral_score: Math.round(mlScore * 1000) / 10,
      graph_score: Math.round((parseFloat(row.hub_score) || 0) * 100000 * 10) / 10,
      ml_score: Math.round(mlScore * 1000) / 10,
      calibrated_score: Math.round(mlScore * 1000) / 10,
      reasons: flags.map((f) => f.replace(/_/g, " ")),
      firstSeen: new Date(Date.now() - ageDays * 86400000).toISOString().slice(0, 10),
      lastActivity: new Date().toISOString().slice(0, 10),
      created_at: FieldValue.serverTimestamp(),
    };

    const docId = row.account_id.replace(/[^a-zA-Z0-9]/g, "_");
    accountBatch.set(db.collection("accounts").doc(docId), docData, { merge: true });
    accountCount++;

    if (accountCount % 450 === 0) {
      await commitWithRetry(accountBatch, `accounts-${accountCount}`);
      accountBatches++;
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ lastImportedIndex: startLine + accountCount, timestamp: new Date().toISOString(), total: accountCount }));
      console.log(`  Accounts: ${accountCount}/${accountsToImport} committed (${accountBatches} batches)`);
      accountBatch = db.batch();
    }
  }

  if (accountCount % 450 !== 0) {
    await commitWithRetry(accountBatch, `accounts-final`);
    accountBatches++;
  }
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ lastImportedIndex: startLine + accountCount, timestamp: new Date().toISOString(), total: accountCount, done: true }));
  console.log(`  Accounts: DONE. ${accountCount} total in ${accountBatches} batches (start=${startOffset}).`);

  if (accountsOnly) {
    console.log("--accounts-only flag set. Skipping transactions.");
    process.exit(0);
  }

  // ---- TRANSACTIONS ----
  const txnsCSV = path.resolve(__dirname, "../dataset_output/transactions_1m.csv");
  console.log(`Reading transactions from ${txnsCSV}...`);
  const { rows: txnRows } = parseCSV(txnsCSV);
  const txnsToImport = Math.min(txnRows.length, sampleLimit);
  console.log(`  ${txnsToImport} transactions to import (of ${txnRows.length} total)`);

  let txnBatch = db.batch();
  let txnCount = 0;
  let txnBatches = 0;

  for (let i = 0; i < txnsToImport; i++) {
    const row = txnRows[i];

    const docData = {
      txn_id: row.txn_id,
      sender_id: row.sender_id,
      receiver_id: row.receiver_id,
      amount: parseFloat(row.amount) || 0,
      timestamp: row.timestamp,
      mode: row.mode,
      is_fraud_pattern: row.is_fraud_pattern,
      isFraud: row.is_fraud_pattern !== "NONE",
      status: "completed",
      type: "transfer",
      created_at: FieldValue.serverTimestamp(),
    };

    const docId = row.txn_id.replace(/[^a-zA-Z0-9]/g, "_");
    txnBatch.set(db.collection("transactions").doc(docId), docData, { merge: true });
    txnCount++;

    if (txnCount % 450 === 0) {
      await txnBatch.commit();
      txnBatches++;
      console.log(`  Transactions: ${txnCount}/${txnsToImport} committed (${txnBatches} batches)`);
      txnBatch = db.batch();
    }
  }

  if (txnCount % 450 !== 0) {
    await txnBatch.commit();
    txnBatches++;
  }
  console.log(`  Transactions: DONE. ${txnCount} total in ${txnBatches} batches.`);

  // ---- SUMMARY ----
  console.log("\n=== INGESTION COMPLETE ===");
  console.log(`Accounts: ${accountCount}`);
  console.log(`Transactions: ${txnCount}`);

  // Count risk levels
  const riskCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (let i = 0; i < accountsToImport; i++) {
    const score = computeMLScore(accountRows[i]);
    riskCounts[riskLevel(score)]++;
  }
  console.log(`Risk distribution: ${JSON.stringify(riskCounts)}`);
  console.log(`Actual mules: ${accountRows.slice(0, accountsToImport).filter((r) => r.is_mule === "True" || r.is_mule === "true").length}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
