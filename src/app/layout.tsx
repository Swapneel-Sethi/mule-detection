import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const inter = Inter({ variable: "--font-display", subsets: ["latin"], weight: ["400", "700"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500", "700"] });

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
};

export const metadata: Metadata = {
  title: { default: "MuleGuard", template: "%s | MuleGuard" },
  description: "AI-powered mule account detection system for financial fraud prevention",
  openGraph: {
    title: "MuleGuard — Mule Account Detection",
    description: "AI-powered mule account detection system for financial fraud prevention",
    type: "website",
    siteName: "MuleGuard",
  },
  twitter: { card: "summary", title: "MuleGuard", description: "AI-powered mule account detection system" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.className} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex bg-void text-bone">
        <a href="#main-content" className="skip-nav">Skip to main content</a>

        <Sidebar />
        {/* tabIndex={-1} lets the skip link move focus, not just scroll; focus:outline-none
            stops :focus-visible from drawing a full-page ring around the landmark */}
        <main id="main-content" tabIndex={-1} className="flex-1 lg:ml-[200px] max-lg:pt-14 min-h-screen focus:outline-none">
          {children}
        </main>
      </body>
    </html>
  );
}
