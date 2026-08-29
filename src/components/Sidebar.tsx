"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const navItems = [
  { href: "/", label: "Platform", icon: "⚡" },
  { href: "/graph", label: "Detection Graph", icon: "🌌" },
  { href: "/alerts", label: "Live Alerts", icon: "🚨" },
  { href: "/analytics", label: "Analytics", icon: "📈" },
  { href: "/accounts", label: "Accounts", icon: "👥" },
  { href: "/transactions", label: "Transactions", icon: "💳" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [activeAlertCount, setActiveAlertCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function fetchCount() {
      try {
        const res = await fetch("/api/alerts/count", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setActiveAlertCount(data.count ?? 0);
      } catch {
        /* ignore */
      }
    }
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <aside className="fixed left-0 top-0 h-full w-[220px] bg-bg-card border-r border-border/30 z-50 flex flex-col justify-between shadow-2xl">
      <div>
        {/* Brand Header with Iconic Orange Logo */}
        <div className="p-5 border-b border-border/25 bg-bg-surface/60">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-7 h-7 rounded-[3px] bg-accent flex items-center justify-center font-bold text-black text-xs shadow-sm shadow-accent/40 group-hover:scale-105 transition-transform">
              <span className="w-3.5 h-3.5 bg-black/30 rounded-[1px] block" />
            </div>
            <div>
              <span className="font-display text-[13px] font-black tracking-widest text-fg uppercase block leading-tight">
                MULEGUARD
              </span>
              <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-fg-dim block font-medium">
                FRAUD • DETECTION
              </span>
            </div>
          </Link>

          <div className="flex items-center justify-between mt-4 px-2.5 py-1 rounded bg-bg-surface border border-border/30">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="font-mono text-[9px] tracking-wider text-fg-dim uppercase font-bold">
                REEL • LIVE
              </span>
            </div>
            <span className="font-mono text-[9px] text-accent font-semibold">
              EST. 2026
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav aria-label="Main navigation" className="px-3 py-4">
          <p className="px-3 pb-2 font-mono text-[9px] tracking-[0.2em] text-fg-dim/60 uppercase font-semibold">
            Console Navigation
          </p>
          <div className="space-y-1">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-md font-mono text-[11px] tracking-wider uppercase transition-all duration-150 ${
                    isActive
                      ? "bg-accent/15 text-accent border border-accent/40 font-bold shadow-sm shadow-accent/20"
                      : "text-fg-dim hover:text-fg hover:bg-bg-surface border border-transparent font-medium"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs">{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                  {item.label === "Live Alerts" && activeAlertCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-accent/25 text-accent border border-accent/40">
                      {activeAlertCount > 99 ? "99+" : activeAlertCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>

      {/* Footer System Status */}
      <div className="p-4 border-t border-border/20 bg-bg-surface/80">
        <div className="flex items-center justify-between font-mono text-[9px] text-fg-dim uppercase tracking-wider font-semibold">
          <span>IRONFORGE ENGINE</span>
          <span className="text-accent font-bold">ONLINE</span>
        </div>
        <p className="font-mono text-[9px] text-fg-dim/50 mt-1">
          24 Models Live • 100k Graph
        </p>
      </div>
    </aside>
  );
}
