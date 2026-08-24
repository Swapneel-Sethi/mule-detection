"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import SidebarOverlay from "./SidebarOverlay";

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
  const [isOpen, setIsOpen] = useState(false);

  const closeDrawer = () => {
    setIsOpen(false);
  };

  const openDrawer = () => {
    setIsOpen(true);
  };

  return (
    <>
      {/* Mobile menu button */}
      <button
        id="mobile-menu-btn"
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-surface-1 border border-frost/10 rounded-lg text-bone"
        onClick={openDrawer}
        aria-label="Open navigation menu"
        aria-expanded={isOpen}
        aria-controls="sidebar-drawer"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <SidebarOverlay isOpen={isOpen} onClose={closeDrawer} />

      <aside
        id="sidebar-drawer"
        className={`fixed left-0 top-0 h-full w-[200px] bg-void border-r border-frost/10 z-50 flex flex-col transform transition-transform duration-300 ease-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="px-5 py-6 border-b border-frost/10 flex items-center justify-between">
          <span className="font-display text-[12px] tracking-[-0.02em] text-bone uppercase">
            MULEGUARD
          </span>
          <button
            className="lg:hidden p-1 text-ash hover:text-bone"
            onClick={closeDrawer}
            aria-label="Close navigation menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 px-3 py-6 overflow-y-auto">
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
                  className={`flex items-center justify-between px-3 py-2 rounded-sm font-mono text-[12px] tracking-[-0.02em] transition-default ${
                    isActive
                      ? "bg-surface-2 text-bone"
                      : "text-ash hover:text-bone"
                  }`}
                  onClick={closeDrawer}
                >
                  {item.label}
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
    </>
  );
}
