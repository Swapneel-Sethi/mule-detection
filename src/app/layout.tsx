import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: { default: "MuleGuard — IronForge AI", template: "%s | MuleGuard" },
  description: "AI-powered money mule detection & graph forensic platform for financial institutions",
  openGraph: {
    title: "MuleGuard — Anti-Mule Intelligence Platform",
    description: "AI-powered money mule detection & graph forensic platform for financial institutions",
    type: "website",
    siteName: "MuleGuard",
  },
  twitter: { card: "summary_large_image", title: "MuleGuard", description: "AI-powered mule account detection system" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="min-h-full flex bg-bg text-fg font-mono">
        <a href="#main-content" className="skip-nav">Skip to main content</a>
        <Sidebar />
        <main id="main-content" className="flex-1 ml-[220px] min-h-screen bg-bg">
          {children}
        </main>
      </body>
    </html>
  );
}
