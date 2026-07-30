# Monitoring & Health Checks Specification

- **Health Endpoint**: `GET /api/health` returns status (`healthy`/`degraded`), Node.js uptime, and database connection state.
- **Structured JSON Logging**: Implemented via `Logger` (`src/shared/lib/logger.ts`).
