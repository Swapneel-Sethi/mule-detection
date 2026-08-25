"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { normalizeAccount, mapAlert, computeStats, MappedAccount } from "./normalizers";
import type { stats as MockStatsShape } from "./mockData";

/**
 * Transaction shape as shipped by /api/data-local (public/transactions_synthetic.json).
 * Declared here rather than borrowed from mockData because the demo data uses a
 * different `type` union ("transfer"/"payment"/…) than the real dataset
 * ("upi"/"imps"/"neft"/"rtgs").
 */
export interface ApiTransaction {
  id: string;
  from: string;
  to: string;
  amount: number;
  timestamp: string;
  type: string;
  flagged: boolean;
  riskScore: number;
}

type Txn = ApiTransaction;
type Alert = ReturnType<typeof mapAlert>;
/** Extra stats fields computed server-side by /api/data-local. */
type Stats = typeof MockStatsShape & {
  riskDistribution?: { critical: number; high: number; medium: number; low: number };
  muleCount?: number;
  highRiskCount?: number;
  totalInDataset?: number;
};

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
  stats: Stats;
  loading: boolean;
  error: string | null;
  source: "local";
  refetch: () => void;
  pagination: PaginationInfo;
  loadMore: () => void;
  setPage: (page: number) => void;
}

type DataState = Omit<UseLocalDataReturn, "pagination" | "loadMore" | "setPage" | "refetch">;

const DEFAULT_PAGINATION: PaginationInfo = {
  page: 1,
  limit: 1000,
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

/** Merge an appended page into prior transactions, dropping duplicate ids. */
function mergeTransactions(prev: Txn[], next: Txn[]): Txn[] {
  if (prev.length === 0) return next;
  const seen = new Set(prev.map((t) => t.id));
  return [...prev, ...next.filter((t) => !seen.has(t.id))];
}

export function useLocalData(category: string = "all"): UseLocalDataReturn {
  const [pagination, setPagination] = useState<PaginationInfo>(DEFAULT_PAGINATION);
  const [data, setData] = useState<DataState>({
    accounts: [],
    transactions: [],
    alerts: [],
    stats: EMPTY_STATS,
    loading: true,
    error: null,
    source: "local",
  });

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const allAccountsRef = useRef<MappedAccount[]>([]);

  const fetchData = useCallback(async (page: number = 1, append: boolean = false) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    inFlightRef.current = true;

    if (!append) setData((prev) => ({ ...prev, loading: true }));

    // Cleared in finally so an aborted/superseded request never leaves a live timer behind.
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch(`/api/data-local?page=${page}&limit=1000&sort=risk_score&order=desc&transactions=true&alerts=true&category=${encodeURIComponent(category)}`, { signal: controller.signal });

      if (!res.ok) throw new Error(`API ${res.status}`);
      const json = await res.json();

      if (json.error) throw new Error(json.error);

      if (!json.accounts || !Array.isArray(json.accounts)) {
        throw new Error("Malformed response from data API");
      }

      const mappedAccounts = json.accounts.map(normalizeAccount);
      const mappedAlerts = (json.alerts || []).map(mapAlert);
      const stats = json.stats || computeStats(mappedAccounts, mappedAlerts);
      const pag = json.pagination || DEFAULT_PAGINATION;
      // Real transactions from the API; empty array when none shipped — never demo data.
      const txns: Txn[] = json.transactions && Array.isArray(json.transactions) ? json.transactions : [];

      // An empty page is a legitimate result (filters can match nothing), not an error.
      if (mountedRef.current && !controller.signal.aborted) {
        const next = append ? [...allAccountsRef.current, ...mappedAccounts] : mappedAccounts;
        allAccountsRef.current = next;
        setData((prev) => ({
          accounts: next,
          transactions: append ? mergeTransactions(prev.transactions, txns) : txns,
          alerts: mappedAlerts,
          stats,
          loading: false,
          error: null,
          source: "local",
        }));
        setPagination(pag);
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
      }));
    } finally {
      clearTimeout(timeoutId);
      // Only the still-current request may release the flag; a superseded call's
      // finally must not clear the flag its successor just set.
      if (abortRef.current === controller) inFlightRef.current = false;
    }
  }, [category]);

  const loadMore = useCallback(() => {
    // Derive from pagination.page and check inFlightRef: rapid double-clicks must
    // neither skip a page nor append the same page twice.
    if (pagination.hasMore && !data.loading && !inFlightRef.current) {
      fetchData(pagination.page + 1, true);
    }
  }, [pagination.hasMore, pagination.page, data.loading, fetchData]);

  const setPage = useCallback((page: number) => {
    fetchData(page, false);
  }, [fetchData]);

  const refetch = useCallback(() => {
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
