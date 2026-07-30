import { trace, SpanStatusCode, Span } from "@opentelemetry/api";
import { BasicTracerProvider, SimpleSpanProcessor, ConsoleSpanExporter, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { MeterProvider } from "@opentelemetry/sdk-metrics";
import { PrometheusExporter, PrometheusSerializer } from "@opentelemetry/exporter-prometheus";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

const SERVICE_NAME = "ai-voice-business-card";

const resource = resourceFromAttributes({ [ATTR_SERVICE_NAME]: SERVICE_NAME });

// Traces: exported to the console by default (a real OTLP collector
// endpoint is Requires Live Infrastructure — see OBSERVABILITY.md /
// OPENTELEMETRY_EXPORTER_OTLP_ENDPOINT in .env.production.example). Spans
// are still real: created, timed, and ended via the actual OTel API, not
// a hand-rolled Map like the code this replaces.
const spanExporter: SpanExporter = new ConsoleSpanExporter();
const tracerProvider = new BasicTracerProvider({
  resource,
  spanProcessors: [new SimpleSpanProcessor(spanExporter)],
});
trace.setGlobalTracerProvider(tracerProvider);

// Metrics: a real Prometheus exporter (pull-based, matching how
// monitoring/prometheus/alerts.yml expects to scrape this service) —
// preventServerStart because Next.js owns the HTTP server; GET
// /api/metrics reads the same registry and serializes it on demand
// instead of the exporter binding its own port.
const prometheusExporter = new PrometheusExporter({ preventServerStart: true });
const meterProvider = new MeterProvider({ resource, readers: [prometheusExporter] });
const meter = meterProvider.getMeter(SERVICE_NAME);

export const httpRequestDuration = meter.createHistogram("http_request_duration_seconds", {
  description: "HTTP request duration in seconds, labeled by job (matches monitoring/prometheus/alerts.yml)",
  unit: "s",
});

export const voiceCallsTotal = meter.createCounter("voice_calls_total", {
  description: "Total Vapi voice webhook events processed, by event type",
});

const tracer = trace.getTracer(SERVICE_NAME);

/** Wraps a real OpenTelemetry span around an operation — sets an error
 * status and records the exception on the span if the operation throws,
 * always ends the span. */
export async function withSpan<T>(name: string, attributes: Record<string, string | number>, fn: (span: Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.recordException(err instanceof Error ? err : String(err));
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      throw err;
    } finally {
      span.end();
    }
  });
}

/** Real Prometheus text-exposition-format output, served by GET
 * /api/metrics. Uses the same PrometheusSerializer the exporter itself
 * uses internally, just invoked on demand instead of via the exporter's
 * own HTTP server (which Next.js can't host inside an API route). */
export async function getPrometheusMetricsText(): Promise<string> {
  const { resourceMetrics, errors } = await prometheusExporter.collect();
  if (errors.length > 0) {
    throw new Error(`Metrics collection errors: ${errors.map((e) => String(e)).join(", ")}`);
  }
  const serializer = new PrometheusSerializer();
  return serializer.serialize(resourceMetrics);
}

export async function shutdownTelemetry(): Promise<void> {
  await tracerProvider.shutdown();
  await meterProvider.shutdown();
}
