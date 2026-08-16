import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
});

export const metadata: Metadata = {
  title: "MuleGuard — Mule Account Detection System",
  description: "Intelligent system for detecting mule accounts used in fraudulent financial transactions using Graph ML and behavioral pattern analysis.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex">
        <Sidebar />
        <main className="flex-1 ml-[240px] min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
