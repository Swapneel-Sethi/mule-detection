"use client";

import Link from "next/link";
import IronforgeInteractions from "@/components/IronforgeInteractions";
import MobileNavToggle from "@/components/MobileNavToggle";

const navItems = [
  { href: "/", label: "Platform" },
  { href: "/graph", label: "Detection Graph" },
  { href: "/alerts", label: "Live Alerts" },
  { href: "/analytics", label: "Analytics" },
  { href: "/accounts", label: "Accounts" },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* ===================== NAV ===================== */}
      <header className="sticky top-0 z-[100] border-b border-[var(--border)] bg-[var(--bg)] backdrop-blur-md">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-10 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 bg-[var(--accent)] flex items-center justify-center relative">
              <i className="fas fa-shield-halved text-[var(--fg)] text-base"></i>
              <div className="absolute -inset-1 border border-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </div>
            <div>
              <div className="font-display text-2xl leading-none tracking-wider">MULEGUARD</div>
              <div className="font-mono text-[10px] text-[var(--muted)] tracking-[0.3em] mt-0.5">
                FRAUD · DETECTION
              </div>
            </div>
          </Link>

          <nav className="hidden lg:flex items-center gap-10">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className="nav-link">
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-5">
            <Link
              href="/graph"
              className="hidden sm:inline-block font-heading text-xs tracking-[0.2em] uppercase text-[var(--fg)] bg-[var(--bg-card)] px-5 py-2.5 hover:bg-[var(--border)] transition-colors"
            >
              Launch Console
            </Link>
            <MobileNavToggle />
          </div>
        </div>

        
      </header>

      {/* ===================== PAGE ===================== */}
      {children}

      {/* ===================== FOOTER ===================== */}
      <footer className="border-t border-[var(--border)] bg-[var(--bg-darker)] py-16 relative overflow-hidden">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-10">
          <div className="font-display text-[18vw] md:text-[14vw] leading-none text-stroke opacity-20 absolute bottom-0 left-0 right-0 text-center pointer-events-none select-none">
            MULEGUARD
          </div>

          <div className="relative grid md:grid-cols-12 gap-10 mb-12">
            <div className="md:col-span-5">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-[var(--accent)] flex items-center justify-center">
                  <i className="fas fa-shield-halved text-[var(--fg)]"></i>
                </div>
                <div>
                  <div className="font-display text-2xl leading-none tracking-wider">MULEGUARD</div>
                  <div className="font-mono text-[10px] text-[var(--muted)] tracking-[0.3em] mt-0.5">
                    EST. 2026
                  </div>
                </div>
              </div>
              <p className="text-[var(--fg-dim)] text-sm leading-relaxed max-w-md mb-6">
                AI-powered mule account detection for financial fraud prevention. Pattern analysis,
                network graphing, and real-time alerts — built to stop money-laundering rings before
                they move.
              </p>
              <div className="flex gap-3">
                <a href="#" className="w-10 h-10 border border-[var(--border-light)] hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--fg)] transition-all flex items-center justify-center">
                  <i className="fab fa-github text-sm"></i>
                </a>
                <a href="#" className="w-10 h-10 border border-[var(--border-light)] hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--fg)] transition-all flex items-center justify-center">
                  <i className="fab fa-x-twitter text-sm"></i>
                </a>
                <a href="#" className="w-10 h-10 border border-[var(--border-light)] hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--fg)] transition-all flex items-center justify-center">
                  <i className="fab fa-linkedin text-sm"></i>
                </a>
              </div>
            </div>

            <div className="md:col-span-2">
              <h5 className="font-mono text-[10px] text-[var(--accent)] tracking-[0.2em] uppercase mb-4">Platform</h5>
              <ul className="space-y-2 text-sm">
                <li><Link href="/graph" className="text-[var(--fg-dim)] hover:text-[var(--fg)] link-underline">Detection Graph</Link></li>
                <li><Link href="/alerts" className="text-[var(--fg-dim)] hover:text-[var(--fg)] link-underline">Live Alerts</Link></li>
                <li><Link href="/analytics" className="text-[var(--fg-dim)] hover:text-[var(--fg)] link-underline">Analytics</Link></li>
                <li><Link href="/accounts" className="text-[var(--fg-dim)] hover:text-[var(--fg)] link-underline">Accounts</Link></li>
              </ul>
            </div>

            <div className="md:col-span-2">
              <h5 className="font-mono text-[10px] text-[var(--accent)] tracking-[0.2em] uppercase mb-4">Resources</h5>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="text-[var(--fg-dim)] hover:text-[var(--fg)] link-underline">Documentation</a></li>
                <li><a href="#" className="text-[var(--fg-dim)] hover:text-[var(--fg)] link-underline">API Reference</a></li>
                <li><a href="#" className="text-[var(--fg-dim)] hover:text-[var(--fg)] link-underline">Methodology</a></li>
                <li><a href="#" className="text-[var(--fg-dim)] hover:text-[var(--fg)] link-underline">Changelog</a></li>
              </ul>
            </div>

            <div className="md:col-span-3">
              <h5 className="font-mono text-[10px] text-[var(--accent)] tracking-[0.2em] uppercase mb-4">Threat Briefing</h5>
              <p className="text-[var(--fg-dim)] text-xs mb-4 leading-relaxed">
                Weekly fraud intelligence, new pattern signatures, and detection notes.
              </p>
              <form className="flex border border-[var(--border-light)] focus-within:border-[var(--accent)] transition-colors">
                <input
                  type="email"
                  placeholder="email@bank.com"
                  className="flex-1 bg-transparent px-3 py-2.5 text-sm text-[var(--fg)] outline-none placeholder:text-[var(--muted)]"
                />
                <button type="submit" className="px-4 bg-[var(--accent)] text-[var(--fg)] hover:bg-[var(--accent-bright)] transition-colors">
                  <i className="fas fa-arrow-right text-xs"></i>
                </button>
              </form>
            </div>
          </div>

          <div className="relative border-t border-[var(--border)] pt-6 flex flex-col md:flex-row justify-between gap-4 text-[var(--muted)] font-mono text-[11px] tracking-[0.15em] uppercase">
            <div>© 2026 MULEGUARD FRAUD DETECTION</div>
            <div className="flex gap-6">
              <a href="#" className="hover:text-[var(--accent)] transition-colors">Privacy</a>
              <a href="#" className="hover:text-[var(--accent)] transition-colors">Terms</a>
              <a href="#" className="hover:text-[var(--accent)] transition-colors">Security</a>
            </div>
          </div>
        </div>
      </footer>

      <IronforgeInteractions />
    </>
  );
}