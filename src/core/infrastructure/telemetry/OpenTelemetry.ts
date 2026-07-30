export interface TraceSpan {
  traceId: string;
  spanId: string;
  name: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, unknown>;
}

export class TelemetryService {
  private spans: TraceSpan[] = [];

  startSpan(name: string, attributes: Record<string, unknown> = {}): TraceSpan {
    const span: TraceSpan = {
      traceId: `trace_${Date.now()}`,
      spanId: `span_${Math.random().toString(36).substring(2, 7)}`,
      name,
      startTime: Date.now(),
      attributes,
    };
    this.spans.push(span);
    return span;
  }

  endSpan(span: TraceSpan): void {
    span.endTime = Date.now();
    const duration = span.endTime - span.startTime;
    console.log(`[Telemetry] Span [${span.name}] completed in ${duration}ms`);
  }

  getCompletedSpans(): TraceSpan[] {
    return this.spans.filter((s) => s.endTime !== undefined);
  }
}
