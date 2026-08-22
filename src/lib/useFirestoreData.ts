"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { accounts as mockAccounts, transactions as mockTransactions, alerts as mockAlerts, stats as mockStats } from "./mockData";
import { normalizeAccount, mapAlert, computeStats, MappedAccount } from "./normalizers";

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

interface UseFirestoreDataReturn {
  accounts: MappedAccount[];
  transactions: typeof mockTransactions;
  alerts: ReturnType<typeof mapAlert>[];
  stats: typeof mockStats;
  loading: boolean;
  error: string | null;
  source: "firestore" | "local" | "mock";
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

export function useFirestoreData(): UseFirestoreDataReturn {
  const [allAccounts, setAllAccounts] = useState<MappedAccount[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>(DEFAULT_PAGINATION);
  const [data, setData] = useState<Omit<UseFirestoreDataReturn, "pagination" | "loadMore" | "setPage">>({
    accounts: [],
    transactions: mockTransactions,
    alerts: [],
    stats: mockStats,
    loading: true,
    error: null,
    source: "mock",
    refetch: () => {},
  });

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const currentPageRef = useRef(1);

  const fetchData = useCallback(async (page: number = 1, append: boolean = false) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!append) setData((prev) => ({ ...prev, loading: true }));

    try {
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(`/api/data-local?page=${page}&limit=500&sort=risk_score&order=desc&transactions=true&alerts=true`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`API ${res.status}`);
      const json = await res.json();

      if (json.error) throw new Error(json.error);

      if (json.accounts && Array.isArray(json.accounts) && json.accounts.length > 0) {
        const mappedAccounts = json.accounts.map(normalizeAccount);
        const mappedAlerts = (json.alerts || []).map(mapAlert);
        const stats = json.stats || computeStats(mappedAccounts, mappedAlerts);
        const pag = json.pagination || DEFAULT_PAGINATION;

        if (mountedRef.current && !controller.signal.aborted) {
          setAllAccounts((prev) => {
            const next = append ? [...prev, ...mappedAccounts] : mappedAccounts;
            setData({
              accounts: next,
              transactions: json.transactions && json.transactions.length > 0 ? json.transactions : mockTransactions,
              alerts: mappedAlerts,
              stats,
              loading: false,
              error: null,
              source: (json.source as string) === "local" ? "local" : "firestore",
              refetch: () => {},
            });
            return next;
          });
          setPagination(pag);
        }
      } else {
        throw new Error("No data");
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      console.warn("Firestore unavailable, using mock data:", err);
      if (mountedRef.current) {
        setData({
          accounts: mockAccounts.map(normalizeAccount) as MappedAccount[],
          transactions: mockTransactions,
          alerts: mockAlerts.map(mapAlert),
          stats: mockStats,
          loading: false,
          error: err instanceof Error ? err.message : "Failed",
          source: "mock",
          refetch: () => {},
        });
      }
    }
  }, []);

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
    fetchData(1, false);
    return () => {
      mountedRef.current = false;
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchData]);

  return { ...data, pagination, loadMore, setPage, refetch };
}

export type { MappedAccount };
