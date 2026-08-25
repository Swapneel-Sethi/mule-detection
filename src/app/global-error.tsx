"use client";

import { useEffect } from "react";

// Global error boundary — catches errors in the root layout itself.
// Must render its own <html>/<body> because it replaces the root layout.
// Global styles and fonts are unavailable here, so colors are inlined from
// the app's design tokens (see globals.css).
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          background: "#000000",
          color: "#ffffff",
          fontFamily: "Inter, system-ui, sans-serif",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          margin: 0,
          padding: "24px",
          textAlign: "center",
        }}
      >
        <title>MuleGuard — Error</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <h1 style={{ fontSize: 36, fontWeight: 300, marginBottom: 12 }}>
          MuleGuard is temporarily unavailable
        </h1>
        <p style={{ color: "#888888", fontSize: 15, marginBottom: 24, maxWidth: 420 }}>
          A critical error occurred. Please try again in a moment.
          {process.env.NODE_ENV === "development" && error.digest ? ` (Ref: ${error.digest})` : ""}
        </p>
        <button
          onClick={() => retry()}
          style={{
            background: "#e2e2e2",
            border: "none",
            borderRadius: 4,
            padding: "10px 20px",
            color: "#000000",
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
