"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { normalizeAccounts, mapAlerts, MappedAccount, MappedAlert } from "./normalizers";
import type { StatsShape as MockStatsShape, Transaction } from "./mockData";

/**
 * Transaction shape as shipped by /api/data-local (public/transactions_synthetic.json).
 * The dataset is rails-aligned to mockData's Transaction ("upi"/"imps"/"neft"/"rtgs"),
 * so this is a plain alias — there is no separate demo-type union anymore.
 */
export type ApiTransaction = Transaction;

type Txn = ApiTransaction;
type Alert = MappedAlert;
/** Extra stats fields computed server-side by /api/data-local. */
type Stats = MockStatsShape & {
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
  /** True while a page-append (loadMore) request is in flight. */
  isLoadingMore: boolean;
  error: string | null;
  source: "local";
  refetch: () => void;
  pagination: PaginationInfo;
  loadMore: () => void;
  setPage: (page: number) => void;
}

type DataState = Omit<UseLocalDataReturn, "pagination" | "isLoadingMore" | "loadMore" | "setPage" | "refetch">;

const DEFAULT_PAGINATION: PaginationInfo = {
  page: 1,
  limit: 1000,
  total: 0,
  totalPages: 0,
  hasMore: false,
};

// Zero-valued stats matching StatsShape — used only until real data arrives.
const EMPTY_STATS: MockStatsShape = {
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

/** Merge appended-page alerts into prior alerts, dropping duplicate ids. */
function mergeAlerts(prev: Alert[], next: Alert[]): Alert[] {
  if (prev.length === 0) return next;
  const seen = new Set(prev.map((a) => a.id));
  return [...prev, ...next.filter((a) => !seen.has(a.id))];
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
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const fetchData = useCallback(async (page: number = 1, append: boolean = false) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    inFlightRef.current = true;

    // Appends keep prior content visible and report progress via isLoadingMore
    // instead of loading:true, which would blank the table on every page.
    if (!append) setData((prev) => ({ ...prev, loading: true }));
    else setIsLoadingMore(true);

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

      const mappedAccounts = normalizeAccounts(json.accounts);
      const mappedAlerts = mapAlerts(json.alerts || []);
      if (!json.stats || typeof json.stats !== "object") {
        // The route always computes stats server-side; a missing/mismatched
        // shape means an API regression, and recomputing client-side would
        // silently swap metric definitions (account-turnover sum vs the
        // txn-sample volume the route serves). Surface it instead.
        throw new Error("Malformed response from data API");
      }
      const stats: Stats = json.stats;
      const pag = json.pagination || DEFAULT_PAGINATION;
      // Real transactions from the API; empty array when none shipped — never demo data.
      const rawTxns: Txn[] =
        json.transactions && Array.isArray(json.transactions) ? json.transactions : [];
      // The dataset ships ~7% of rows on a legacy 0–1 risk scale; rescale onto
      // the 0–100 axis every consumer sorts, clamps and renders against.
      const txns: Txn[] = rawTxns.map((t) =>
        t.riskScore > 1 ? t : { ...t, riskScore: t.riskScore * 100 }
      );

      // An empty page is a legitimate result (filters can match nothing), not an error.
      if (mountedRef.current && !controller.signal.aborted) {
        const next = append ? [...allAccountsRef.current, ...mappedAccounts] : mappedAccounts;
        allAccountsRef.current = next;
        setData((prev) => ({
          accounts: next,
          transactions: append ? mergeTransactions(prev.transactions, txns) : txns,
          alerts: append ? mergeAlerts(prev.alerts, mappedAlerts) : mappedAlerts,
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

      console.error(err);

      // A page-1/category-change failure leaves accumulated rows from the OLD
      // category in allAccountsRef — drop them so a later append can never mix
      // categories, and reset pagination so loadMore cannot resume a dead cursor.
      if (!append) {
        allAccountsRef.current = [];
        setPagination({ ...DEFAULT_PAGINATION });
      }

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
      // Only the still-current request may release the flags; a superseded
      // call's finally must not clear the state its successor just set.
      if (abortRef.current === controller) {
        inFlightRef.current = false;
        setIsLoadingMore(false);
      }
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
    const fetchTimer: ReturnType<typeof setTimeout> = setTimeout(() => fetchData(1, false), 0);
    return () => {
      mountedRef.current = false;
      clearTimeout(fetchTimer);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchData]);

  return { ...data, pagination, isLoadingMore, loadMore, setPage, refetch };
}

export type { MappedAccount };
