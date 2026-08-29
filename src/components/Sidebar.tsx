"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const navItems = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/accounts", label: "Accounts", icon: "👥" },
  { href: "/transactions", label: "Transactions", icon: "💳" },
  { href: "/graph", label: "Graph & Galaxy", icon: "🌌" },
  { href: "/alerts", label: "Alerts", icon: "🚨" },
  { href: "/analytics", label: "Analytics", icon: "📈" },
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
    <aside className="fixed left-0 top-0 h-full w-[220px] bg-bg-surface border-r border-border/30 z-50 flex flex-col justify-between shadow-2xl">
      <div>
        {/* Brand Header */}
        <div className="px-5 py-6 border-b border-border/30 bg-bg-surface/60 backdrop-blur">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-accent/20 border border-accent/40 flex items-center justify-center text-accent font-bold text-xs shadow-sm shadow-accent/30">
              MG
            </div>
            <div>
              <span className="font-display text-[14px] font-bold tracking-wider text-fg uppercase block leading-none">
                MULEGUARD
              </span>
              <span className="font-mono text-[9px] uppercase tracking-widest text-accent font-semibold block mt-1">
                IRONFORGE AI
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4 px-2 py-1 rounded bg-accent/10 border border-accent/20">
            <span className="w-2 h-2 rounded-full bg-risk-low animate-pulse shadow-sm shadow-risk-low/50" />
            <span className="font-mono text-[10px] tracking-wider text-fg-dim uppercase font-medium">
              DEFENSE ACTIVE
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav aria-label="Main navigation" className="px-3 py-5">
          <p className="px-3 pb-2 font-mono text-[10px] tracking-widest text-fg-dim/60 uppercase">
            Surveillance
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
                  className={`flex items-center justify-between px-3 py-2.5 rounded-md font-mono text-[12px] tracking-tight transition-all duration-200 ${
                    isActive
                      ? "bg-accent/15 text-accent border border-accent/40 font-semibold shadow-sm shadow-accent/20"
                      : "text-fg-dim hover:text-fg hover:bg-bg-card border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm opacity-80">{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                  {item.label === "Alerts" && activeAlertCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-risk-critical/20 text-risk-critical border border-risk-critical/40">
                      {activeAlertCount > 99 ? "99+" : activeAlertCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>

      {/* Footer metadata */}
      <div className="p-4 border-t border-border/20 bg-bg-surface/80">
        <div className="flex items-center justify-between font-mono text-[10px] text-fg-dim">
          <span>PIPELINE v2.4</span>
          <span className="text-accent font-semibold">ONLINE</span>
        </div>
        <p className="font-mono text-[9px] text-fg-dim/50 mt-1">
          100k Node Ensemble Engine
        </p>
      </div>
    </aside>
  );
}
