"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  ArrowLeftRight,
  AlertTriangle,
  BarChart3,
  Settings,
  Shield,
  Activity,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", icon: Users },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/graph", label: "Network Graph", icon: Activity },
  { href: "/alerts", label: "Alerts", icon: AlertTriangle },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-full w-[240px] bg-carbon border-r border-chalk z-50 flex flex-col">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-chalk">
        <div className="w-8 h-8 rounded-[12px] bg-obsidian border border-chalk flex items-center justify-center">
          <Shield className="w-4 h-4 text-signal-green" />
        </div>
        <div>
          <span className="text-[15px] font-medium tracking-tight text-paper-white">
            MuleGuard
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-signal-green signal-pulse" />
            <span className="text-[11px] text-fog">System Active</span>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4">
        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-[12px] text-[14px] font-medium transition-colors ${
                  isActive
                    ? "bg-graphite text-paper-white"
                    : "text-fog hover:text-paper-white hover:bg-graphite/50"
                }`}
              >
                <item.icon className="w-[18px] h-[18px]" />
                {item.label}
                {item.label === "Alerts" && (
                  <span className="ml-auto text-[11px] bg-danger/20 text-danger px-1.5 py-0.5 rounded-full font-medium">
                    6
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="px-3 pb-4">
        <div className="px-3 py-3 rounded-[12px] bg-obsidian border border-chalk">
          <div className="flex items-center gap-2 mb-2">
            <Settings className="w-4 h-4 text-fog" />
            <span className="text-[13px] font-medium text-bone">Settings</span>
          </div>
          <p className="text-[11px] text-slate-mist">
            Graph ML v2.4 • Last scan: 2h ago
          </p>
        </div>
      </div>
    </aside>
  );
}
