"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Area,
  AreaChart,
  LineChart,
  Line,
  Label,
} from "recharts";
import SankeyChart from "./SankeyChart";
import { PATTERN_LINE_COLORS, OTHER_PATTERN_COLOR } from "./patternColors";
import { formatCurrencyINR } from "@/lib/utils";

const CHART_COLORS = {
  void: "var(--bg)",
  charcoal: "var(--fg-dim)",
  frost: "var(--fg)",
} as const;

// Canonical fraud patterns — same keys the /api/analytics payload and the
// Sankey use, so pattern selection drives every chart on the page.
const PATTERN_LINES = [
  { key: "FANIN", color: PATTERN_LINE_COLORS.FANIN },
  { key: "FANOUT", color: PATTERN_LINE_COLORS.FANOUT },
  { key: "PASSTHROUGH", color: PATTERN_LINE_COLORS.PASSTHROUGH },
  { key: "CIRCULAR", color: PATTERN_LINE_COLORS.CIRCULAR },
];

// Dot/legend colors for the filter chip — PATTERN_LINES plus the Sankey's
// OTHER bucket so every selectable pattern resolves to its Sankey color.
const PATTERN_DOT_COLORS: Record<string, string> = {
  ...Object.fromEntries(PATTERN_LINES.map((p) => [p.key, p.color])),
  OTHER: OTHER_PATTERN_COLOR,
};

// Only the payload fields this page renders; the API ships more (muleAccounts,
// cleanAccounts, inOutData, …) that stay unconsumed until their cards exist.
interface AnalyticsData {
  totalAccounts: number;
  totalTransactions: number;
  totalAlerts: number;
  // Owner definition: alerts = accounts warranting review (mule + high-risk).
  alertAccounts: number;
  // Disjoint tier counts from the API — same formulas as Dashboard/Accounts.
  muleCount: number;
  highRiskCount: number;
  riskCounts: { critical: number; high: number; medium: number; low: number };
  flaggedTransactions: number;
  totalTurnover: number;
  bankData: { bank: string; count: number }[];
  patternData: { pattern: string; count: number }[];
  txnByPattern: Record<string, number>;
  moneyFlowData: { from: string; to: string; amountInLakhs: number }[];
  volumeByDay: { day: string; volumeInLakhs: number }[];
  hourlyAlerts: { hour: string; alerts: number }[];
  patternTimeData: Record<string, string | number>[];
  circularPaths: { from: string; via: string; to: string; amount: number }[];
  sankeyFlows: { from: string; to: string; amount: number; pattern: string }[];
  allAccountsTotal: number;
};

interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  sub?: string;
  className?: string;
}

const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({ label, value, sub, className = "", ...props }, ref) => {
    // Pinned locale instead of getUserLocale(): navigator-derived locales made SSR
    // and client output diverge (hydration mismatch) and disagreed with sibling
    // cards that hardcode "en-IN".
    const compactFormatter = new Intl.NumberFormat("en-IN", {
      notation: "compact",
      compactDisplay: "short",
      maximumFractionDigits: 1,
    });
    const formattedValue = typeof value === "number" ? compactFormatter.format(value) : value;

    return (
      <div
        ref={ref}
        className={`info-card p-4 rounded-md ${className}`}
        {...props}
      >
        <p className="font-mono text-caption tracking-wide text-[var(--fg-dim)] uppercase mb-1 truncate">
          {label}
        </p>
        <p className="font-display text-heading-sm font-normal leading-tight text-[var(--fg)] tracking-tight truncate">
          {formattedValue}
        </p>
        {sub && <p className="font-mono text-caption text-[var(--fg-dim)] mt-1 truncate">
          {sub}
        </p>}
      </div>
    );
  }
);

StatCard.displayName = "StatCard";

type HeadingLevel = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ children, className = "", ...props }, ref) => (
    <div
      ref={ref}
      className={`info-card rounded-lg p-4 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
);

Card.displayName = "Card";

export function CardTitle({ children, as: Tag = "h2" }: { children: React.ReactNode; as?: HeadingLevel }) {
  // Default h2 keeps heading order valid under each page's <h1> (WCAG 1.3.1);
  // callers can raise it with `as="h3"` etc. where the section nests deeper.
  return (
    <Tag className="font-display text-body tracking-[-0.02em] mb-4 text-[var(--fg)]">
      {children}
    </Tag>
  );
}

interface LoadingStateProps {
  message?: string;
  variant?: "full" | "inline" | "skeleton";
  skeletonCount?: number;
  skeletonVariant?: "text" | "card" | "table" | "chart";
}

// Single source for the spinner glyph; callers size it via className.
function SpinnerSvg({ className }: { className: string }) {
  return (
    <svg className={`animate-spin ${className} text-[var(--fg-dim)]`} viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

export default function LoadingState({ 
  message = "Loading...", 
  variant = "full",
  skeletonCount = 3,
  skeletonVariant = "card"
}: LoadingStateProps) {
  if (variant === "skeleton") {
    // We don't have SkeletonGroup in this file, so we fallback to inline
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12" role="status" aria-label={message}>
        <SpinnerSvg className="h-8 w-8" />
        <p className="font-mono text-caption text-[var(--fg-dim)]">{message}</p>
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <div className="flex items-center gap-3 py-4" role="status" aria-label={message}>
        <SpinnerSvg className="h-5 w-5" />
        <span className="font-mono text-caption text-[var(--fg-dim)]">{message}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12" role="status" aria-label={message}>
      <SpinnerSvg className="h-8 w-8" />
      <p className="font-mono text-caption text-[var(--fg-dim)]">{message}</p>
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  description?: string;
  onRetry?: () => void;
}

export function ErrorState({ message, description, onRetry }: ErrorStateProps) {
  return (
    <div className="text-center">
      <p className="font-mono text-caption text-[var(--fg-dim)]">{message}</p>
      {description && <p className="font-mono text-caption text-[var(--fg-dim)] mt-2">{description}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 font-mono text-caption text-[var(--fg-dim)] border border-[var(--border-light)] px-4 py-2 rounded hover:text-[var(--fg)]"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export default function AnalyticsContent() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [patternFilter, setPatternFilter] = useState<string | null>(null);

  // Controller for whichever load is in flight (initial effect or manual
  // retry), so cleanup and superseding loads always abort the right request.
  const inFlight = useRef<AbortController | null>(null);

  const loadAnalytics = useCallback((signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    fetch("/api/analytics", { signal })
      .then(async (r) => {
        if (!r.ok) {
          // The route reports failures as JSON `{ error }` with a 5xx status
          // (which lands here); surface its reason instead of a bare status.
          let message = `API ${r.status}`;
          try {
            const body = await r.json();
            if (body && typeof body.error === "string" && body.error) {
              message = body.error;
            }
          } catch {
            // non-JSON body — keep the status-based message
          }
          throw new Error(message);
        }
        return r.json();
      })
      .then((json) => {
        if (!json || typeof json !== "object" || !("riskCounts" in json)) {
          throw new Error("Malformed analytics payload");
        }
        setData(json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        // Aborted (unmount/supersede): not an error the user should see.
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load analytics");
        setLoading(false);
      });
  }, []);

  const retry = useCallback(() => {
    inFlight.current?.abort(); // supersede any earlier attempt
    const controller = new AbortController();
    inFlight.current = controller;
    loadAnalytics(controller.signal);
  }, [loadAnalytics]);

  useEffect(() => {
    const timer = window.setTimeout(retry, 0);
    return () => {
      window.clearTimeout(timer);
      inFlight.current?.abort();
    };
  }, [retry]);

  if (loading || !data) {
    if (error) {
      return (
        <div className="reveal p-8 max-w-[1200px] mx-auto">
          <PageHeader title="Analytics" subtitle="Error" />
          <ErrorState message="Couldn't load analytics" description={error} onRetry={retry} />
        </div>
      );
    }
    return (
      <div className="reveal p-8 max-w-[1200px] mx-auto">
        <PageHeader title="MuleGuard" />
        <LoadingState message="Loading analytics..." />
      </div>
    );
  }

  // Month span for the day-keyed charts' caption, derived from the data's
  // MM-DD keys — the payload carries no year, so none is claimed.
  const MONTH_ABBREVS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthSpan = Array.from(
    new Set(data.volumeByDay.map((d) => d.day.slice(0, 2)))
  )
    .sort()
    .map((mm) => MONTH_ABBREVS[Number(mm) - 1] ?? mm)
    .join("–");

  // Bar fills reuse the line chart's palette (PATTERN_LINES via
  // PATTERN_DOT_COLORS) so a pattern keeps one identity across every chart;
  // filtering dims the others via opacity instead of recoloring them into
  // the background.
  const txnAmountByPattern = [
    { pattern: "FANIN", amount: data.txnByPattern.FANIN || 0 },
    { pattern: "FANOUT", amount: data.txnByPattern.FANOUT || 0 },
    { pattern: "PASSTHROUGH", amount: data.txnByPattern.PASSTHROUGH || 0 },
    { pattern: "CIRCULAR", amount: data.txnByPattern.PASSTHROUGH || 0 },
  ].map((entry) => ({
    ...entry,
    fill: PATTERN_DOT_COLORS[entry.pattern] ?? CHART_COLORS.frost,
  }));

  // Disjoint categories — identical numbers to the Dashboard's Account
  // Categories card (both come from the API's muleCount/highRiskCount).
  const muleTierCount = Number.isFinite(data.muleCount) ? data.muleCount : data.riskCounts.critical + data.riskCounts.high;
  const highRiskBandCount = Number.isFinite(data.highRiskCount) ? data.highRiskCount : Math.max(data.totalAccounts - muleTierCount, 0);
  const categoryBarData = [
    { name: "Mule", count: muleTierCount, fill: "var(--color-risk-critical)" },
    { name: "High Risk", count: highRiskBandCount, fill: "var(--color-risk-high)" },
  ];

  return (
    <div className="reveal p-8 max-w-[1200px] mx-auto space-y-6">
      <PageHeader title="Analytics" />

      <div className="reveal-stagger grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Flagged Accounts" value={data.totalAccounts.toLocaleString("en-IN")} sub={`of ${data.allAccountsTotal.toLocaleString("en-IN")} total`} />
        <StatCard label="Flagged Turnover" value={formatCurrencyINR(data.totalTurnover)} />
        <StatCard label="Flagged Transactions" value={data.flaggedTransactions.toLocaleString("en-IN")} sub={`of ${data.totalTransactions.toLocaleString("en-IN")} total`} />
        <StatCard
          label="Alerts"
          value={data.alertAccounts.toLocaleString("en-IN")}
          sub="accounts warranting review"
        />
      </div>

      {patternFilter && (
        <div className="reveal-stagger flex items-center gap-3 flex-wrap bg-[var(--bg-card)] border border-[var(--border-light)] rounded-lg px-4 py-2.5">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: PATTERN_DOT_COLORS[patternFilter] }}
          />
          <span className="font-mono text-[11px] tracking-[-0.02em] text-[var(--fg)]">
            Filtered: {patternFilter}
          </span>
          <span className="font-mono text-[10px] tracking-[-0.02em] text-[var(--fg-dim)]">
            {/* Note: We are inside the filter bar, so we can use the data from the closure */}
            {/* We need to recalculate the filtered flows and accounts */}
            {/* But note: we are in the JSX, so we can compute it here */}
            {/* We'll compute it again for clarity */}
            {() => {
              const sel = data.sankeyFlows.filter((f) => f.pattern === patternFilter);
              const total = sel.reduce((s, f) => s + (Number(f.amount) || 0), 0);
              const accts = new Set(sel.flatMap((f) => [f.from, f.to])).size;
              return (
                <>
                  {sel.length} flows &middot; {accts} accounts &middot; {formatCurrencyINR(total)}
                </>
              );
            }}
          </span>
          <button
            onClick={() => setPatternFilter(null)}
            className="ml-auto font-mono text-[10px] tracking-[-0.02em] text-[var(--fg-dim)] hover:text-[var(--fg)] border border-[var(--border-light)] rounded-sm px-2 py-0.5"
          >
            Clear filter <span aria-hidden="true">✕</span>
          </button>
        </div>
      )}

      <div className="reveal-stagger">
        <Card>
          <CardTitle>Suspicious Transaction Patterns Over Time</CardTitle>
          {/* minHeight keeps short viewports from squeezing the plot area past
              legibility; height stays the preferred size on larger screens. */}
          <ResponsiveContainer width="100%" height={380} minHeight={300} role="img" aria-label="Line chart showing suspicious transaction patterns over time">
            <LineChart data={data.patternTimeData} margin={{ top: 30, right: 30, left: 10, bottom: 50 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.charcoal} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 10, fill: CHART_COLORS.frost, fontFamily: "JetBrains Mono" }}
                stroke={CHART_COLORS.charcoal}
              >
                <Label
                  value={`Date${monthSpan ? ` [${monthSpan}]` : ""}`}
                  position="bottom"
                  offset={10}
                  // SVG presentation attributes, not CSS classes — a recharts
                  // Label renders <text>, where className color rules lose to
                  // the inherited SVG fill and rendered dark-on-dark.
                  fill="#e2e2e2"
                  fontSize={10}
                  fontFamily="JetBrains Mono, monospace"
                />
              </XAxis>
              <YAxis
                tick={{ fontSize: 10, fill: CHART_COLORS.frost, fontFamily: "JetBrains Mono" }}
                stroke={CHART_COLORS.charcoal}
              >
                <Label
                  value="Alert Count"
                  angle={-90}
                  position="insideLeft"
                  offset={10}
                  fill="#e2e2e2"
                  fontSize={10}
                  fontFamily="JetBrains Mono, monospace"
                />
              </YAxis>
              <Tooltip content={<CustomTooltip />} />
              {PATTERN_LINES.map((p) => (
                <Line
                  key={p.key}
                  type="linear"
                  dataKey={p.key}
                  stroke={p.color}
                  strokeWidth={patternFilter === p.key ? 3 : 2}
                  strokeOpacity={patternFilter && patternFilter !== p.key ? 0.12 : 1}
                  name={p.key}
                  dot={{ r: 3, fill: p.color }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-4 mt-3 justify-center">
            {PATTERN_LINES.map((l) => (
              <div key={l.key} className="flex items-center gap-1.5">
                <div className="w-3 h-[2px] rounded-full" style={{ backgroundColor: l.color }} />
                <span className="font-mono text-[11px] tracking-[-0.02em] text-[var(--fg-dim)]">{l.key}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="reveal-stagger grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardTitle>Transaction Amount by Pattern</CardTitle>
          <p className="font-mono text-[11px] tracking-[-0.02em] text-[var(--fg-dim)] mb-4">By canonical fraud pattern</p>
          <ResponsiveContainer width="100%" height={280} minHeight={220} role="img" aria-label="Bar chart showing transaction amount by fraud pattern">
            <BarChart data={txnAmountByPattern}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.charcoal} />
              <XAxis
                dataKey="pattern"
                tick={{ fontSize: 10, fill: CHART_COLORS.frost, fontFamily: "JetBrains Mono" }}
                stroke={CHART_COLORS.charcoal}
              />
              <YAxis
                tick={{ fontSize: 10, fill: CHART_COLORS.frost, fontFamily: "JetBrains Mono" }}
                stroke={CHART_COLORS.charcoal}
                tickFormatter={(v: number) =>
                  v >= 1e7
                    ? `${(v / 1e7).toFixed(1)}Cr`
                    : v >= 1e5
                      ? `${(v / 1e5).toFixed(0)}L`
                      : `${Math.round(v)}`
                }
              >
                <Label
                  value="Total Amount in ₹"
                  angle={-90}
                  position="insideLeft"
                  offset={10}
                  fill="#e2e2e2"
                  fontSize={10}
                  fontFamily="JetBrains Mono, monospace"
                />
              </YAxis>
              <Tooltip
                content={({ active, payload, label: lbl }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  return (
                    <div className="bg-[var(--bg)] border border-[var(--border-light)] rounded-lg px-3 py-2">
                      <p className="font-mono text-[10px] tracking-[-0.02em] text-[var(--fg-dim)]">
                        Pattern: <span className="text-[var(--fg)]">{String(lbl)}</span>
                      </p>
                      <p className="font-mono text-[10px] tracking-[-0.02em] text-[var(--fg-dim)]">
                        Amount: <span className="text-[var(--fg)]">{formatCurrencyINR(Number(payload[0]?.value ?? 0))}</span>
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="amount" name="Total Amount">
                {txnAmountByPattern.map((entry) => (
                  <Cell
                    key={entry.pattern}
                    fill={entry.fill}
                    fillOpacity={
                      patternFilter && entry.pattern !== patternFilter ? 0.15 : 1
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <CardTitle>Top Banks by Flagged Accounts</CardTitle>
          <div className="space-y-2 max-h-[280px] overflow-y-auto">
            {data.bankData.slice(0, 15).map((b) => (
              <div key={b.bank} className="flex items-center gap-3">
                <span className="font-mono text-[10px] tracking-[-0.02em] text-[var(--fg-dim)] min-w-[80px] truncate">
                  {b.bank}
                </span>
                <div className="flex-1 h-[6px] bg-[var(--bg)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--fg)]/60 rounded-full"
                    style={{
                      width: `${(b.count / (data.bankData[0]?.count || 1)) * 100}%`,
                    }}
                  />
                </div>
                <span className="font-mono text-[10px] tracking-[-0.02em] text-[var(--fg-dim)] min-w-[40px] text-right">
                  {b.count.toLocaleString("en-IN")}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="reveal-stagger">
        <Card>
          <CardTitle>Transaction Volume Over Time</CardTitle>
          <ResponsiveContainer width="100%" height={280} minHeight={200} role="img" aria-label="Area chart showing transaction volume over time in lakhs">
            <AreaChart data={data.volumeByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.charcoal} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 10, fill: CHART_COLORS.frost }}
                stroke={CHART_COLORS.charcoal}
              />
              <YAxis
                tick={{ fontSize: 10, fill: CHART_COLORS.frost }}
                stroke={CHART_COLORS.charcoal}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="volumeInLakhs"
                stroke={CHART_COLORS.frost}
                fill={CHART_COLORS.frost}
                fillOpacity={0.08}
                strokeWidth={1.5}
                name="Volume (₹L)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="reveal-stagger">
        <Card>
          <CardTitle>Hourly Alert Distribution</CardTitle>
          <ResponsiveContainer width="100%" height={280} minHeight={220} role="img" aria-label="Bar chart showing hourly alert distribution">
            <BarChart data={data.hourlyAlerts}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.charcoal} />
              <XAxis
                dataKey="hour"
                tick={{ fontSize: 10, fill: CHART_COLORS.frost }}
                stroke={CHART_COLORS.charcoal}
                interval={2}
              />
              <YAxis
                tick={{ fontSize: 10, fill: CHART_COLORS.frost }}
                stroke={CHART_COLORS.charcoal}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="alerts" fill={CHART_COLORS.frost} name="Alerts" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="reveal-stagger grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardTitle>Account Categories</CardTitle>
          <ResponsiveContainer width="100%" height={240} minHeight={180} role="img" aria-label="Bar chart showing Mule vs High Risk account counts">
            <BarChart data={categoryBarData}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.charcoal} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: CHART_COLORS.frost }}
                stroke={CHART_COLORS.charcoal}
              />
              <YAxis
                tick={{ fontSize: 10, fill: CHART_COLORS.frost }}
                stroke={CHART_COLORS.charcoal}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Accounts" radius={[2, 2, 0, 0]}>
                {categoryBarData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <CardTitle>Money Flow</CardTitle>
          <ResponsiveContainer width="100%" height={240} minHeight={200} role="img" aria-label="Horizontal bar chart showing money flow between risk levels">
            <BarChart data={data.moneyFlowData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.charcoal} />
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: CHART_COLORS.frost }}
                stroke={CHART_COLORS.charcoal}
              />
              <YAxis
                dataKey={(d) => `${d.from.slice(-4)}→${d.to.slice(-4)}`}
                type="category"
                tick={{ fontSize: 10, fill: CHART_COLORS.frost }}
                stroke={CHART_COLORS.charcoal}
                // Width fits the abbreviated "…1234→…5678" ticks at 375px;
                // full ids crowded out the plot area entirely.
                width={110}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="amountInLakhs"
                fill={CHART_COLORS.frost}
                name="Amount (₹L)"
                radius={[0, 2, 2, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="reveal-stagger grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardTitle>Summary</CardTitle>
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] tracking-[-0.02em] text-[var(--fg-dim)]">Mule Accounts</span>
              <span className="font-mono text-[13px] tracking-[-0.02em] text-[var(--fg)]">{muleTierCount.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] tracking-[-0.02em] text-[var(--fg-dim)]">High Risk (Potential Mules)</span>
              <span className="font-mono text-[13px] tracking-[-0.02em] text-[var(--fg)]">{highRiskBandCount.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] tracking-[-0.02em] text-[var(--fg-dim)]">Total Flagged Accounts</span>
              <span className="font-mono text-[13px] tracking-[-0.02em] text-[var(--fg)]">{data.totalAccounts.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] tracking-[-0.02em] text-[var(--fg-dim)]">Total Flagged Transactions</span>
              <span className="font-mono text-[13px] tracking-[-0.02em] text-[var(--fg)]">{data.flaggedTransactions.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] tracking-[-0.02em] text-[var(--fg-dim)]">Total Accounts in Dataset</span>
              <span className="font-mono text-[13px] tracking-[-0.02em] text-[var(--fg)]">{data.allAccountsTotal.toLocaleString("en-IN")}</span>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle>Patterns</CardTitle>
          <div className="space-y-2 max-h-[240px] overflow-y-auto">
            {data.patternData.slice(0, 10).map((p) => (
              <div key={p.pattern} className="flex items-center gap-3">
                <span className="font-mono text-[10px] tracking-[-0.02em] text-[var(--fg-dim)] min-w-[120px] truncate">
                  {p.pattern}
                </span>
                <div className="flex-1 h-[6px] bg-[var(--bg)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--fg)]/60 rounded-full"
                    style={{
                      width: `${(p.count / (data.patternData[0]?.count || 1)) * 100}%`,
                    }}
                  />
                </div>
                <span className="font-mono text-[10px] tracking-[-0.02em] text-[var(--fg-dim)] min-w-[40px] text-right">
                  {p.count.toLocaleString("en-IN")}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="reveal-stagger">
        <Card>
          <CardTitle>Circular Transaction Loops</CardTitle>
          <div className="space-y-3 max-h-[280px] overflow-y-auto">
            {data.circularPaths.map((path) => (
              <div
                key={`${path.from}-${path.via}-${path.to}`}
                className="bg-[var(--bg)] border border-[var(--border-light)] rounded-lg p-3"
              >
                <p className="font-mono text-[11px] tracking-[-0.02em] text-[var(--fg)] mb-1">
                  {path.from.slice(-6)} → {path.via.slice(-6)} →{" "}
                  {path.to.slice(-6)} → {path.from.slice(-6)}
                </p>
                <p className="font-mono text-[11px] tracking-[-0.02em] text-[var(--fg-dim)]">
                  Amount: {formatCurrencyINR(path.amount)}
                </p>
              </div>
            ))}
            {data.circularPaths.length === 0 && (
              <p className="font-mono text-[10px] text-[var(--fg-dim)] text-center py-8">
                No circular loops detected
              </p>
            )}
          </div>
        </Card>
      </div>

      <div className="reveal-stagger">
        <Card>
          <SankeyChart
            flows={data.sankeyFlows}
            accountsTotal={data.totalAccounts}
            selectedPattern={patternFilter}
            onPatternSelect={setPatternFilter}
          />
        </Card>
      </div>
    </div>
  );
}

// We need to define CustomTooltip again because we moved it inside the component? 
// Actually, we moved it outside? Let's put it back inside the component or above.
// We'll put it above the AnalyticsContent function but below the imports and local components.
// We already have a CustomTooltip defined above? We had one in the original file.
// We'll move it to be above the AnalyticsContent function.

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string }>; label?: string }) {
  if (!active || !payload) return null;
  return (
    <div className="bg-[var(--bg)] border border-[var(--border-light)] rounded-lg px-3 py-2">
      <p className="font-mono text-[10px] tracking-[-0.02em] text-[var(--fg-dim)] mb-1">
        {label}
      </p>
      {payload.map((p, i) => (
        <p
          key={i}
          className="font-mono text-[10px] tracking-[-0.02em] text-[var(--fg)]"
        >
          {p.name}:{" "}
          {typeof p.value === "number"
            ? p.value.toLocaleString("en-IN")
            : p.value}
        </p>
      ))}
    </div>
  );
}