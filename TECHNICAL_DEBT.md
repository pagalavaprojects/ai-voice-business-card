# Technical Debt Register

## 1. In-Memory Task Queue (`InMemoryTaskQueue.ts`)
- **Impact**: Medium.
- **Description**: Asynchronous tasks queued via Node.js `setTimeout` may fail to complete if Vercel serverless containers freeze immediately after sending HTTP 200.
- **Remediation**: Swap `InMemoryTaskQueue` for QStash or Upstash Redis queue.

## 2. Hardcoded Demo Fallbacks in UI Pages
- **Impact**: Low.
- **Description**: Public card and Admin leads UI use fallback demo parameters (`demo-company`, `demo-employee`) if URL params are omitted.
- **Remediation**: Add 404 Not Found handling when company or employee ID does not exist in Supabase DB.
