"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/accounts", label: "Accounts" },
  { href: "/transactions", label: "Transactions" },
  { href: "/graph", label: "Graph" },
  { href: "/alerts", label: "Alerts" },
  { href: "/analytics", label: "Analytics" },
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
      } catch { /* ignore */ }
    }
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <aside className="fixed left-0 top-0 h-full w-[200px] bg-void border-r border-frost/10 z-50 flex flex-col">
      <div className="px-5 py-6 border-b border-frost/10">
        <span className="font-mono text-[12px] tracking-[-0.02em] text-bone uppercase">
          MuleGuard
        </span>
        <div className="flex items-center gap-2 mt-2">
          <span className="w-1.5 h-1.5 rounded-full bg-bone" />
          <span className="font-mono text-[10px] tracking-[-0.02em] text-ash">System Active</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-6">
        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-3 py-2 rounded-[2px] font-mono text-[12px] tracking-[-0.02em] transition-colors ${
                  isActive
                    ? "bg-charcoal text-bone"
                    : "text-ash hover:text-bone"
                }`}
              >
                {item.label}
                {item.label === "Alerts" && activeAlertCount > 0 && (
                  <span className="text-[10px] text-ash">
                    {activeAlertCount > 99 ? "99+" : activeAlertCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="px-5 pb-5">
        <span className="font-mono text-[10px] tracking-[-0.02em] text-ash/50">
          v2.4
        </span>
      </div>
    </aside>
  );
}
