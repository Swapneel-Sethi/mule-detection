"use client";

import { useState, useEffect, useRef } from "react";
import type { MappedAccount } from "@/lib/useLocalData";
import RiskBadge from "@/components/ui/RiskBadge";
import LoadingState from "@/components/ui/LoadingState";
import ErrorState from "@/components/ui/ErrorState";
import { formatCurrencyINR, cn } from "@/lib/utils";

/**
 * Raw transaction row as served by GET /api/transactions?id=<account_id>
 * (verbatim from public/transactions_synthetic.json — numeric fields are
 * strings in the artifact and are coerced at render time).
 */
interface AccountTransaction {
  id: string;
  from: string;
  to: string;
  amount: string;
  timestamp: string;
  type: string;
  flagged: string | boolean;
  riskScore: string;
}

const PAGE_SIZE = 50;

function isFlagged(t: AccountTransaction): boolean {
  return t.flagged === true || t.flagged === "True" || t.flagged === "true";
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts; // corrupt stamp stays visible as-is
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-[var(--bg-card-hover)]/40 border border-[var(--border)]/10 rounded-sm px-3 py-2">
      <dt className="font-mono text-[10px] tracking-[-0.02em] text-[var(--muted)] uppercase">{label}</dt>
      <dd className="font-mono text-[13px] tracking-[-0.02em] text-[var(--fg)] mt-0.5 break-all">
        {value}
      </dd>
    </div>
  );
}

export default function AccountDrawer({
  account,
  onClose,
}: {
  account: MappedAccount;
  onClose: () => void;
}) {
  const [txns, setTxns] = useState<AccountTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  // First page loads in the mount effect below — starts truthy so the very
  // first render already shows the loading state without a synchronous
  // setState inside that effect.
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Move focus into the dialog on open so Esc/screen-reader users land here;
  // restore it to the trigger (the clicked table row) on close.
  const previouslyFocused = useRef<HTMLElement | null>(null);
  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    // Slide-over locks background scroll — a long accounts list otherwise
    // scrolls invisibly behind the panel.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, []);

  // Esc closes the drawer — standard dialog semantics for a slide-over.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // First page: every setState happens after the await boundary (or behind
  // the cancelled flag), never synchronously in the effect body.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      setError(null);
      try {
        const res = await fetch(
          `/api/transactions?id=${encodeURIComponent(account.id)}&limit=${PAGE_SIZE}`,
          { signal: controller.signal }
        );
        if (cancelled) return;
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || `Request failed (${res.status})`);
        }
        const data = (await res.json()) as {
          total: number;
          hasMore: boolean;
          transactions: AccountTransaction[];
        };
        setTotal(data.total);
        setHasMore(data.hasMore);
        setTxns(data.transactions);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [account.id]);

  // "Load more" is an event handler, so its synchronous state updates are fine.
  const loadMore = async () => {
    setLoadingMore(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/transactions?id=${encodeURIComponent(account.id)}&limit=${PAGE_SIZE}&offset=${txns.length}`
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      const data = (await res.json()) as {
        total: number;
        hasMore: boolean;
        transactions: AccountTransaction[];
      };
      setTotal(data.total);
      setHasMore(data.hasMore);
      const seen = new Set(txns.map((t) => t.id));
      setTxns([...txns, ...data.transactions.filter((t) => !seen.has(t.id))]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingMore(false);
    }
  };

  const explanation = account.explanation;

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label={`Account details: ${account.id}`}
    >
      {/* Backdrop */}
      <button
        aria-label="Close account details"
        className="absolute inset-0 w-full bg-[var(--bg)]/60 cursor-default"
        onClick={onClose}
        tabIndex={-1}
      />

      {/* Panel */}
      <aside className="absolute right-0 top-0 h-full w-full max-w-[480px] bg-[var(--bg-card)] border-l border-[var(--border)]/10 overflow-y-auto flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-[var(--bg-card)] border-b border-[var(--border)]/10 px-5 py-4 flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[13px] tracking-[-0.02em] text-[var(--fg)] font-medium">
              {account.name}
            </p>
            <p className="font-mono text-[11px] tracking-[-0.02em] text-[var(--muted)] mt-0.5">
              {account.id} · {account.bank} · {account.city}
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <RiskBadge level={account.riskLevel} />
              <span className="font-mono text-[11px] tracking-[-0.02em] text-[var(--fg)]">
                Risk {account.riskScore.toFixed(0)}%
              </span>
              {account.isMule && (
                <span className="font-mono text-[10px] tracking-[-0.02em] uppercase px-1.5 py-0.5 rounded-sm bg-risk-critical/20 text-risk-critical border border-risk-critical/30">
                  Confirmed Mule
                </span>
              )}
            </div>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close"
            className="font-mono text-[13px] text-[var(--muted)] hover:text-[var(--fg)] border border-[var(--border)]/10 rounded-sm w-7 h-7 shrink-0 transition-default"
          >
            ✕
          </button>
        </header>

        <div className="px-5 py-4 space-y-6 flex-1">
          {/* Flags */}
          {account.flags.length > 0 && (
            <section aria-label="Pattern flags">
              <h3 className="font-mono text-[10px] tracking-[-0.02em] text-[var(--muted)] uppercase mb-2">
                Pattern Flags
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {account.flags.map((flag) => (
                  <span
                    key={flag}
                    className="font-mono text-[10px] tracking-[-0.02em] text-[var(--muted)] bg-[var(--bg-darker)]/30 px-1.5 py-0.5 rounded-sm border border-[var(--border)]/10"
                  >
                    {flag}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Details + flow stats */}
          <section aria-label="Account statistics">
            <h3 className="font-mono text-[10px] tracking-[-0.02em] text-[var(--muted)] uppercase mb-2">
              Overview
            </h3>
            <dl className="grid grid-cols-2 gap-2">
              <Stat label="Status" value={account.status.replace("_", " ")} />
              <Stat label="Balance" value={formatCurrencyINR(account.balance)} />
              <Stat label="Turnover" value={formatCurrencyINR(account.turnover)} />
              <Stat label="Transactions" value={account.totalTransactions.toLocaleString("en-IN")} />
              <Stat label="Inflow links" value={account.inDegree.toLocaleString("en-IN")} />
              <Stat label="Outflow links" value={account.outDegree.toLocaleString("en-IN")} />
            </dl>
          </section>

          {/* Model scores */}
          <section aria-label="Model scores">
            <h3 className="font-mono text-[10px] tracking-[-0.02em] text-[var(--muted)] uppercase mb-2">
              Model Scores
            </h3>
            <dl className="grid grid-cols-3 gap-2">
              <Stat label="Behavioral" value={account.behavioralScore.toFixed(1)} />
              <Stat label="Graph" value={account.graphScore.toFixed(1)} />
              <Stat label="Temporal" value={account.temporalScore.toFixed(1)} />
              <Stat label="ML" value={account.mlScore.toFixed(1)} />
              <Stat label="Calibrated" value={account.calibratedScore.toFixed(3)} />
              <Stat label="PageRank" value={(account.pagerankScore * 1e6).toFixed(2) + "e-6"} />
            </dl>
          </section>

          {/* Engine explanation */}
          {explanation && (
            <section aria-label="Detection explanation">
              <h3 className="font-mono text-[10px] tracking-[-0.02em] text-[var(--muted)] uppercase mb-2">
                Why Flagged
              </h3>
              <p className="font-mono text-[11px] tracking-[-0.02em] text-[var(--fg)] leading-relaxed mb-2">
                {explanation.summary}
              </p>
              {explanation.red_flags.length > 0 && (
                <ul className="space-y-1.5 mb-3">
                  {explanation.red_flags.map((rf, i) => (
                    <li key={i} className="font-mono text-[11px] tracking-[-0.02em] text-[var(--fg)] leading-relaxed pl-3 border-l-2 border-risk-critical/50">
                      <span className="text-risk-critical uppercase mr-1.5">{rf.potential_pattern}</span>
                      {rf.reason}
                    </li>
                  ))}
                </ul>
              )}
              {[...explanation.factors]
                .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
                .slice(0, 4)
                .map((f, i) => (
                  <div key={i} className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[10px] tracking-[-0.02em] text-[var(--muted)] w-32 shrink-0 truncate" title={f.label}>
                      {f.label}
                    </span>
                    <div className="flex-1 h-[2px] bg-[var(--bg-card-hover)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--fg)] rounded-full"
                        style={{ width: `${Math.min(Math.abs(f.contribution) * 100 / Math.max(...explanation.factors.map(x => Math.abs(x.contribution))), 100)}%` }}
                      />
                    </div>
                    <span className="font-mono text-[10px] tracking-[-0.02em] text-[var(--muted)] w-12 text-right">
                      {(f.contribution >= 0 ? "+" : "") + f.contribution.toFixed(2)}
                    </span>
                  </div>
                ))}
            </section>
          )}

          {/* Transaction history */}
          <section aria-label="Transaction history">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-mono text-[10px] tracking-[-0.02em] text-[var(--muted)] uppercase">
                Transaction History
              </h3>
              {!loading && !error && (
                <span className="font-mono text-[10px] tracking-[-0.02em] text-[var(--muted)]">
                  {total.toLocaleString("en-IN")} total
                </span>
              )}
            </div>

            {loading && <LoadingState />}
            {error && txns.length === 0 && (
              <ErrorState
                message="Couldn't load transactions"
                description={error}
                onRetry={loadMore}
              />
            )}

            {!loading && !error && txns.length === 0 && (
              <p className="font-mono text-[11px] tracking-[-0.02em] text-[var(--muted)]">
                No transactions recorded for this account.
              </p>
            )}

            <ul className="space-y-1.5">
              {txns.map((t) => {
                const outgoing = t.from === account.id;
                const counterparty = outgoing ? t.to : t.from;
                return (
                  <li
                    key={t.id}
                    className="border border-[var(--border)]/10 rounded-sm px-3 py-2 bg-[var(--bg-card-hover)]/30"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "font-mono text-[10px] tracking-[-0.02em] px-1.5 py-0.5 rounded-sm shrink-0",
                          outgoing
                            ? "text-risk-high bg-risk-high/10"
                            : "text-[var(--fg)] bg-[var(--fg)]/10"
                        )}
                      >
                        {outgoing ? "OUT →" : "← IN"}
                      </span>
                      <span className="font-mono text-[13px] tracking-[-0.02em] text-[var(--fg)] ml-auto">
                        {outgoing ? "−" : "+"}
                        {formatCurrencyINR(Number(t.amount))}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <span className="font-mono text-[10px] tracking-[-0.02em] text-[var(--muted)] truncate" title={counterparty}>
                        {counterparty}
                      </span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        {isFlagged(t) && (
                          <span className="font-mono text-[9px] tracking-[-0.02em] uppercase text-risk-critical border border-risk-critical/30 rounded-sm px-1">
                            flagged
                          </span>
                        )}
                        <span className="font-mono text-[10px] tracking-[-0.02em] text-[var(--muted)] uppercase">
                          {t.type}
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="font-mono text-[10px] tracking-[-0.02em] text-[var(--muted)]">
                        {t.id}
                      </span>
                      <span className="font-mono text-[10px] tracking-[-0.02em] text-[var(--muted)]">
                        {formatTimestamp(t.timestamp)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>

            {hasMore && !error && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full mt-2 font-mono text-[11px] tracking-[-0.02em] text-[var(--fg)] bg-[var(--bg-card)] border border-[var(--border)]/10 rounded-sm px-3 py-1.5 hover:bg-[var(--bg-card-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-default"
              >
                {loadingMore ? "Loading…" : `Load more (${(total - txns.length).toLocaleString("en-IN")} remaining)`}
              </button>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}