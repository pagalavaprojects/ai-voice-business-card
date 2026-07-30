import { withSpan, httpRequestDuration, voiceCallsTotal, getPrometheusMetricsText } from "@/core/infrastructure/telemetry/otel";

describe("OpenTelemetry (real @opentelemetry/api tracer + real Prometheus exporter)", () => {
  it("creates a real span with a valid trace/span context and returns the wrapped function's result", async () => {
    let capturedContext: { traceId: string; spanId: string } | null = null;

    const result = await withSpan("test_operation", { companyId: "company-1" }, async (span) => {
      const ctx = span.spanContext();
      capturedContext = { traceId: ctx.traceId, spanId: ctx.spanId };
      return "operation result";
    });

    expect(result).toBe("operation result");
    expect(capturedContext).not.toBeNull();
    // A real span has a 32-hex-char trace ID and 16-hex-char span ID —
    // not zeroed out, which is what a no-op/disabled tracer would produce.
    expect(capturedContext!.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(capturedContext!.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(capturedContext!.traceId).not.toBe("00000000000000000000000000000000");
  });

  it("still propagates the error when the wrapped function throws, after recording it on the span", async () => {
    await expect(
      withSpan("test_failing_operation", {}, async () => {
        throw new Error("simulated failure");
      })
    ).rejects.toThrow("simulated failure");
  });

  it("records real metrics that show up in real Prometheus text-exposition output", async () => {
    httpRequestDuration.record(0.42, { job: "vapi_webhook", message_type: "end-of-call-report" });
    voiceCallsTotal.add(1, { event_type: "end-of-call-report", status: "200" });

    const text = await getPrometheusMetricsText();

    expect(text).toContain("http_request_duration_seconds");
    expect(text).toContain("voice_calls_total");
    expect(text).toContain('job="vapi_webhook"');
  });
});
