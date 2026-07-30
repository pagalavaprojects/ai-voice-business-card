# OpenTelemetry & Observability Architecture

## Architecture Specification
- **Structured JSON Logging**: Handled via `Logger` (`src/shared/lib/logger.ts`) emitting timestamp, severity, request context (`requestId`, `companyId`, `employeeId`, `sessionId`), and execution metrics.
- **Trace Context**: Distributed trace propagation via HTTP headers (`x-correlation-id`).
- **Integration Targets**: Prometheus, Grafana, Datadog, Sentry, New Relic.
