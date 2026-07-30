# Observability & Structured Logging Specification

`Logger` (`src/shared/lib/logger.ts`) emits structured JSON logs containing timestamp, log level, event message, and contextual metadata (`companyId`, `callDuration`, `toolName`, `latencyMs`).
