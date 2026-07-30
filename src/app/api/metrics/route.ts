import { NextResponse } from "next/server";
import { getPrometheusMetricsText } from "@/core/infrastructure/telemetry/otel";
import { Logger } from "@/shared/lib/logger";

/** Real Prometheus scrape endpoint — this is what
 * monitoring/prometheus/alerts.yml's rules (http_request_duration_seconds_bucket
 * etc.) actually need something to expose; previously nothing in this
 * codebase ever produced Prometheus-format output at all. No auth on this
 * route by design (Prometheus scrapers don't send admin session cookies);
 * network-level restriction to the scraper is a live-infrastructure /
 * ingress concern, not something this route can enforce. */
export async function GET() {
  try {
    const body = await getPrometheusMetricsText();
    return new NextResponse(body, {
      status: 200,
      headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
    });
  } catch (error) {
    Logger.error("Failed to collect Prometheus metrics", { error: error instanceof Error ? error.message : String(error) });
    return new NextResponse("# metrics collection failed\n", { status: 500 });
  }
}
