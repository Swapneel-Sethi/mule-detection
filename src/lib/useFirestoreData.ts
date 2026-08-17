"use client";

import { useState, useEffect } from "react";
import { accounts as mockAccounts, transactions as mockTransactions, alerts as mockAlerts, stats as mockStats } from "./mockData";
import { normalizeAccount, mapAlert, computeStats, MappedAccount } from "./normalizers";

interface UseFirestoreDataReturn {
  accounts: MappedAccount[];
  transactions: typeof mockTransactions;
  alerts: ReturnType<typeof mapAlert>[];
  stats: typeof mockStats;
  loading: boolean;
  error: string | null;
  source: "firestore" | "mock";
  refetch: () => void;
}

export function useFirestoreData(): UseFirestoreDataReturn {
  const [data, setData] = useState<UseFirestoreDataReturn>({
    accounts: [],
    transactions: mockTransactions,
    alerts: [],
    stats: mockStats,
    loading: true,
    error: null,
    source: "mock",
    refetch: () => {},
  });

  const fetchData = async () => {
    setData((prev) => ({ ...prev, loading: true }));
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const res = await fetch("/api/data", { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`API ${res.status}`);
      const json = await res.json();

      if (json.error) throw new Error(json.error);

      if (json.accounts && Array.isArray(json.accounts) && json.accounts.length > 0) {
        const mappedAccounts = json.accounts.map(normalizeAccount);
        const mappedAlerts = (json.alerts || []).map(mapAlert);
        const stats = json.stats || computeStats(mappedAccounts, mappedAlerts);

        setData({
          accounts: mappedAccounts,
          transactions: json.transactions && json.transactions.length > 0 ? json.transactions : mockTransactions,
          alerts: mappedAlerts,
          stats,
          loading: false,
          error: null,
          source: "firestore",
          refetch: fetchData,
        });
      } else {
        throw new Error("No data");
      }
    } catch (err) {
      console.warn("Firestore unavailable, using mock data:", err);
      setData({
        accounts: mockAccounts.map(normalizeAccount) as MappedAccount[],
        transactions: mockTransactions,
        alerts: mockAlerts.map(mapAlert),
        stats: mockStats,
        loading: false,
        error: err instanceof Error ? err.message : "Failed",
        source: "mock",
        refetch: fetchData,
      });
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetchData();
    return () => { cancelled = true; };
  }, []);

  return data;
}

export type { MappedAccount };
