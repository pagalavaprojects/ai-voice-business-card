"use client";

/** Last-resort boundary for failures in the root layout itself, which
 * error.tsx cannot catch. It replaces the whole document, so it must render
 * its own <html> and <body> and cannot rely on the app's global stylesheet
 * being available — hence the inline styles. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#090d16",
          color: "#e2e8f0",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "24rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: ".5rem" }}>Application error</h1>
          <p style={{ fontSize: ".875rem", color: "#94a3b8", marginBottom: "1rem" }}>
            The application failed to start. Please try again shortly.
          </p>
          {error.digest && (
            <p style={{ fontFamily: "monospace", fontSize: ".7rem", color: "#64748b", marginBottom: "1rem" }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              background: "#0284c7",
              color: "#fff",
              border: "none",
              borderRadius: ".5rem",
              padding: ".5rem 1rem",
              fontSize: ".75rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
