import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import SidebarOverlay from "@/components/SidebarOverlay";

const inter = Inter({ variable: "--font-display", subsets: ["latin"], weight: ["400"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400"] });

export const metadata: Metadata = {
  title: { default: "MuleGuard", template: "%s | MuleGuard" },
  description: "AI-powered mule account detection system for financial fraud prevention",
  openGraph: {
    title: "MuleGuard — Mule Account Detection",
    description: "AI-powered mule account detection system for financial fraud prevention",
    type: "website",
    siteName: "MuleGuard",
  },
  twitter: { card: "summary_large_image", title: "MuleGuard", description: "AI-powered mule account detection system" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="min-h-full flex bg-void text-bone">
        <a href="#main-content" className="skip-nav">Skip to main content</a>
        
        <Sidebar />
        <main id="main-content" className="flex-1 lg:ml-[200px] min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
