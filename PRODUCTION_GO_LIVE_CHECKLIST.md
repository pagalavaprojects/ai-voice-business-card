# Production Go-Live Checklist

- [x] Full codebase compiles cleanly (`npx tsc --noEmit` exit code 0).
- [x] Automated test suites pass (6/6 Jest test suites, 14/14 tests).
- [x] Next.js production build completes successfully (`npm run build`).
- [x] Production Dockerfile & docker-compose configurations verified.
- [ ] Step 1: Deploy `supabase/migrations/20260729_v2_enterprise_schema.sql` to live Supabase DB.
- [ ] Step 2: Configure production environment variables in Vercel / Docker host:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `VAPI_API_KEY`
  - `VAPI_WEBHOOK_SECRET`
  - `CALCOM_API_KEY`
  - `RESEND_API_KEY`
- [ ] Step 3: Trigger live Vapi voice test session & verify webhook function call executions.
