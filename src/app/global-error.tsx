"use client";

// Global error boundary — catches errors in the root layout itself.
// Must render its own <html>/<body> because it replaces the root layout.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
        <h1 style={{ fontSize: 36, fontWeight: 300, marginBottom: 12 }}>
          MuleGuard is temporarily unavailable
        </h1>
        <p style={{ color: "#b3b3b5", fontSize: 15, marginBottom: 24, maxWidth: 420 }}>
          A critical error occurred. Please try again in a moment.
          {error.digest ? ` (Ref: ${error.digest})` : ""}
        </p>
        <button
          onClick={reset}
          style={{
            background: "#08090b",
            border: "1px solid #232323",
            borderRadius: 18,
            padding: "10px 20px",
            color: "#fff",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
