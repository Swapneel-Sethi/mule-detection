import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
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
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Oswald:wght@300;400;500;600;700&family=Archivo:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
        />
      </head>
      <body className="min-h-full bg-[var(--bg)] text-[var(--fg)] font-body">
        <div className="grain" id="grain" aria-hidden="true"></div>
        {children}
      </body>
    </html>
  );
}
