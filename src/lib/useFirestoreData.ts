"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { normalizeAccount, mapAlert, computeStats, MappedAccount } from "./normalizers";
import type { transactions as MockTransactionsShape, stats as MockStatsShape } from "./mockData";

type Txn = (typeof MockTransactionsShape)[number];
type Alert = ReturnType<typeof mapAlert>;

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

interface UseLocalDataReturn {
  accounts: MappedAccount[];
  transactions: Txn[];
  alerts: Alert[];
  stats: typeof MockStatsShape & { riskDistribution?: { critical: number; high: number; medium: number; low: number } };
  loading: boolean;
  error: string | null;
  source: "local";
  refetch: () => void;
  pagination: PaginationInfo;
  loadMore: () => void;
  setPage: (page: number) => void;
}

const DEFAULT_PAGINATION: PaginationInfo = {
  page: 1,
  limit: 200,
  total: 0,
  totalPages: 0,
  hasMore: false,
};

// Zero-valued stats matching mockData's shape — used only until real data arrives.
const EMPTY_STATS = {
  totalAccounts: 0,
  flaggedAccounts: 0,
  totalTransactions: 0,
  flaggedTransactions: 0,
  totalVolume: 0,
  activeAlerts: 0,
  resolvedAlerts: 0,
  avgRiskScore: 0,
};

export function useFirestoreData(category: string = "all"): UseLocalDataReturn {
  const [pagination, setPagination] = useState<PaginationInfo>(DEFAULT_PAGINATION);
  const [data, setData] = useState<Omit<UseLocalDataReturn, "pagination" | "loadMore" | "setPage">>({
    accounts: [],
    transactions: [],
    alerts: [],
    stats: EMPTY_STATS,
    loading: true,
    error: null,
    source: "local",
    refetch: () => {},
  });

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const currentPageRef = useRef(1);
  const allAccountsRef = useRef<MappedAccount[]>([]);

  const fetchData = useCallback(async (page: number = 1, append: boolean = false) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!append) setData((prev) => ({ ...prev, loading: true }));

    try {
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(`/api/data-local?page=${page}&limit=1000&sort=risk_score&order=desc&transactions=true&alerts=true&category=${encodeURIComponent(category)}`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`API ${res.status}`);
      const json = await res.json();

      if (json.error) throw new Error(json.error);

      if (json.accounts && Array.isArray(json.accounts) && json.accounts.length > 0) {
        const mappedAccounts = json.accounts.map(normalizeAccount);
        const mappedAlerts = (json.alerts || []).map(mapAlert);
        const stats = json.stats || computeStats(mappedAccounts, mappedAlerts);
        const pag = json.pagination || DEFAULT_PAGINATION;
        // Real transactions from the API; empty array when none shipped — never demo data.
        const txns: Txn[] = json.transactions && Array.isArray(json.transactions) ? json.transactions : [];

        if (mountedRef.current && !controller.signal.aborted) {
          const next = append ? [...allAccountsRef.current, ...mappedAccounts] : mappedAccounts;
          allAccountsRef.current = next;
          setData({
            accounts: next,
            transactions: txns,
            alerts: mappedAlerts,
            stats,
            loading: false,
            error: null,
            source: "local",
            refetch: () => {},
          });
          setPagination(pag);
        }
      } else {
        throw new Error("No data");
      }
    } catch (err) {
      // Superseded by a newer request or unmount: a newer fetchData owns the state now.
      if (abortRef.current !== controller || !mountedRef.current) return;

      // Abort with no newer request in flight == 30s timeout fired.
      const timedOut = controller.signal.aborted;
      const message = timedOut
        ? "Request timed out. The dataset is large — try again."
        : err instanceof Error
          ? err.message
          : "Failed to load data";

      setData((prev) => ({
        ...prev,
        // Keep previously-loaded REAL data visible alongside the error banner when we have it;
        // otherwise show nothing rather than fabricated demo data.
        accounts: prev.accounts.length > 0 ? prev.accounts : [],
        transactions: prev.transactions.length > 0 ? prev.transactions : [],
        alerts: prev.alerts.length > 0 ? prev.alerts : [],
        stats: prev.accounts.length > 0 ? prev.stats : EMPTY_STATS,
        loading: false,
        error: message,
        source: "local",
        refetch: () => {},
      }));
    }
  }, [category]);

  const loadMore = useCallback(() => {
    if (pagination.hasMore && !data.loading) {
      currentPageRef.current += 1;
      fetchData(currentPageRef.current, true);
    }
  }, [pagination.hasMore, data.loading, fetchData]);

  const setPage = useCallback((page: number) => {
    currentPageRef.current = page;
    fetchData(page, false);
  }, [fetchData]);

  const refetch = useCallback(() => {
    currentPageRef.current = 1;
    fetchData(1, false);
  }, [fetchData]);

  useEffect(() => {
    mountedRef.current = true;
    const frame =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame(() => fetchData(1, false))
        : (setTimeout(() => fetchData(1, false), 0) as unknown as number);
    return () => {
      mountedRef.current = false;
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame as number);
      else clearTimeout(frame as unknown as ReturnType<typeof setTimeout>);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchData]);

  return { ...data, pagination, loadMore, setPage, refetch };
}

export type { MappedAccount };
