# Operations & Site Reliability Runbook

## Incident Response Steps:
1. **Webhook Failure / High Latency**: Check `GET /api/health` status. Verify Vapi webhook secret matches `VAPI_WEBHOOK_SECRET`.
2. **Database Connection Pool Exhaustion**: Inspect active Supabase connections in Supabase Dashboard.
