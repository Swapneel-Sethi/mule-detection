"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
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
  // Track the lg breakpoint so inert/aria-hidden only apply on mobile,
  // where the drawer can actually be hidden. Desktop drawer is always shown.
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => {
      setIsMobileViewport(mq.matches);
      // Crossing up to >=lg turns the drawer into a persistent sidebar;
      // disarm any modal machinery (scroll lock, focus trap) left over.
      if (!mq.matches) setIsOpen(false);
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Stable identities so SidebarOverlay's focus-trap effect doesn't churn.
  const closeDrawer = useCallback(() => {
    setIsOpen(false);
  }, []);

  const openDrawer = useCallback(() => {
    setIsOpen(true);
  }, []);

  // On mobile an open drawer behaves as a modal dialog; at >=lg it is a plain
  // persistent navigation landmark.
  const isModal = isOpen && isMobileViewport;

  return (
    <>
      {/* Mobile menu button */}
      <button
        id="mobile-menu-btn"
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-[var(--fg)]"
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
        className={`fixed left-0 top-0 h-full w-[200px] bg-[var(--bg-darker)] border-r border-[var(--border)] z-50 flex flex-col transform transition-[transform,visibility] duration-300 ease-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0 visible' : '-translate-x-full invisible'
        } lg:visible`}
        role={isModal ? "dialog" : "navigation"}
        aria-modal={isModal || undefined}
        aria-label="Main navigation"
        aria-hidden={(isMobileViewport && !isOpen) || undefined}
        inert={(isMobileViewport && !isOpen) || undefined}
      >
        <div className="px-5 py-6 border-b border-[var(--border)] flex items-center justify-between">
          <span className="font-display text-[12px] tracking-[-0.02em] text-[var(--fg)] uppercase">
            MULEGUARD
          </span>
          <button
            className="lg:hidden p-1 text-[var(--fg-dim)] hover:text-[var(--fg)]"
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
                // Segment-boundary check so e.g. /alerts-archive never
                // highlights both it and /alerts.
                (item.href !== "/" && pathname.startsWith(item.href + "/"));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center justify-between px-3 py-2 rounded-sm font-mono text-[12px] tracking-[-0.02em] transition-default ${
                    isActive
                      ? "bg-[var(--bg-card)] text-[var(--fg)]"
                      : "text-[var(--fg-dim)] hover:text-[var(--fg)]"
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
          <span className="font-mono text-[10px] tracking-[-0.02em] text-[var(--fg-dim)]">
            MuleGuard demo build
          </span>
        </div>
      </aside>
    </>
  );
}