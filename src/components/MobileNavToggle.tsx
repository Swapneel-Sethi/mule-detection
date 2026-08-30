"use client";

import Link from "next/link";
import { useState } from "react";

const navItems = [
  { href: "/", label: "Platform" },
  { href: "/graph", label: "Detection Graph" },
  { href: "/alerts", label: "Live Alerts" },
  { href: "/analytics", label: "Analytics" },
  { href: "/accounts", label: "Accounts" },
];

export default function MobileNavToggle() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="lg:hidden w-10 h-10 border border-[var(--border-light)] flex items-center justify-center text-[var(--fg)]"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <i className={open ? "fas fa-xmark" : "fas fa-bars"}></i>
      </button>

      {open && (
        <div className="lg:hidden border-t border-[var(--border)] bg-[var(--bg-darker)]">
          <nav className="flex flex-col px-6 py-4 gap-3">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="nav-link"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/graph"
              className="font-heading text-xs tracking-[0.2em] uppercase text-[var(--bg)] bg-[var(--accent)] px-5 py-2.5 text-center hover:bg-[var(--accent-bright)] transition-colors"
              onClick={() => setOpen(false)}
            >
              Launch Console
            </Link>
          </nav>
        </div>
      )}
    </>
  );
}
