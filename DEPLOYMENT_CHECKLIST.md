# Production Deployment Checklist

Work top to bottom. Each step says how to *verify* it, not just what to do —
a step isn't done until its check passes.

Repository: https://github.com/pagalavaprojects/ai-voice-business-card

---

## 0 · Before you start

- [ ] `npm ci && npm run build` succeeds locally with zero warnings
- [ ] `npm test` — 98 passing
- [ ] `npm run verify:migrations` — migrations apply cleanly

---

## 1 · Production Supabase

Use a **separate project** from development. The service-role key bypasses RLS
entirely, so a shared project means a staging bug can delete customer data.

- [ ] Create the project; save the database password somewhere durable
- [ ] Apply all migrations from `supabase/migrations/` **in filename order** via
      the SQL Editor
- [ ] Copy Project URL, `anon` key, and `service_role` key
- [ ] Point `.env.local` at production temporarily and run `npm run verify:db`

**Verify:** `verify:db` prints `PASS` — 23 tables reachable, pgvector RPC
callable, no duplicate rows.

- [ ] Seed the first company: `npm run seed:pagalava`
- [ ] Storage buckets (`knowledge-documents`, `exports`, `voice-assets`,
      `logos`) — created automatically on first use; no action needed

---

## 2 · Vercel

- [ ] Import the GitHub repo at [vercel.com/new](https://vercel.com/new)
- [ ] Framework preset auto-detects **Next.js** — accept the defaults. No
      `vercel.json` is needed and adding one is more likely to break the build
      than help
- [ ] Set every environment variable below **before** the first deploy

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Build-time — changing it later needs a **redeploy**, not a restart |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Build-time |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server-only. Never prefix with `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_VAPI_PUBLIC_KEY` | ✅ | Build-time. Without it the widget is silent |
| `PUBLIC_BASE_URL` | ✅ | Your production HTTPS domain. Without it **voice tools are disabled** |
| `VAPI_API_KEY` | ✅ | Vapi *private* key |
| `VAPI_WEBHOOK_SECRET` | ✅ | Must be **identical** to the value set in Vapi's dashboard |
| `NODE_ENV` | auto | Vercel sets `production` |
| `CALCOM_API_KEY` | booking | Omit and booking returns a simulated response |
| `CALCOM_EVENT_TYPE_ID` | booking | Numeric id from the event's URL |
| `CALCOM_WEBHOOK_SECRET` | booking | |
| `OPENAI_API_KEY` | RAG | Omit and search degrades to text matching |
| `RESEND_API_KEY` | email | Omit and sends are logged `FAILED` in `email_logs` |
| `REDIS_URL` | scale | Enables caching + distributed rate limiting |
| `WORKER_ENABLED` | ✖ | **Leave unset on Vercel.** See §5 |

> Anything left unset degrades honestly and says so in `/api/health` — nothing
> silently pretends to work.

- [ ] Deploy
- [ ] **Verify:** `curl https://<domain>/api/health` → `"status":"healthy"` with
      `database: connected`

---

## 3 · Domain & SSL

- [ ] Add the custom domain in Vercel → Settings → Domains
- [ ] Point the registrar's records as instructed; certificates issue
      automatically
- [ ] Update `PUBLIC_BASE_URL` to the final domain and **redeploy**
- [ ] **Verify:** `curl -I https://<domain>` returns `200` and
      `Strict-Transport-Security`

---

## 4 · Webhooks

- [ ] Vapi → Server URL: `https://<domain>/api/vapi/webhook`
- [ ] Vapi → secret matches `VAPI_WEBHOOK_SECRET` exactly
- [ ] Cal.com → `https://<domain>/api/webhooks/calcom`, secret matches
      `CALCOM_WEBHOOK_SECRET`

**Verify:** place a test call, then confirm a row appears in `conversations`.
If nothing lands, the secret mismatch is the first thing to check — a wrong
secret rejects every webhook silently by design.

---

## 5 · Background worker (optional)

Vercel **cannot** run long-lived processes. Leave `WORKER_ENABLED` unset there
and knowledge indexing runs synchronously on the request — slower, but it
always completes.

If you want queued indexing, deploy `npm run worker` to a container host
(Railway, Render, Fly) pointed at the same `REDIS_URL`, and set
`WORKER_ENABLED=true` **only on that worker and the web app that shares it**.

- [ ] **Verify (if enabled):** upload a document and watch its status reach
      `READY`. Stuck at `PENDING` means nothing is draining the queue

---

## 6 · Post-deploy smoke test

- [ ] Open `https://<domain>/<companyId>/<employeeId>`
- [ ] Card shows the real person — no "Demo Card" banner, no not-found state
- [ ] Press the mic → browser asks for microphone permission
- [ ] **You hear the scripted greeting**, not a generic one
- [ ] Live transcript populates as it speaks
- [ ] Ask it to save your details → a row appears in `leads`

That last step is the real proof the webhook loop is closed. If the call works
but no lead lands, `PUBLIC_BASE_URL` or the webhook secret is wrong.

---

## 7 · Monitoring (optional)

- [ ] `docker compose -f docker-compose.monitoring.yml up -d` with
      `GRAFANA_ADMIN_PASSWORD` set
- [ ] Point `monitoring/prometheus/prometheus.yml` at the production host
- [ ] **Verify:** Grafana → *AI Voice Business Card — Platform* shows
      `Service up = UP`

---

## Rollback

**Application** — Vercel → Deployments → previous → *Promote to Production*.
Instant, no rebuild.

**Database** — migrations are forward-only; there are no down-migrations. Every
migration to date is purely additive, so rolling the app back against a newer
schema is safe: old code ignores new columns.

> This stops being true the moment a migration drops or renames anything.
> Before any such change, take a point-in-time backup and treat app rollback as
> requiring a paired database restore. **Roll back the app first, then the
> database** — never the reverse, or live code briefly queries columns that no
> longer exist.

**Config** — `NEXT_PUBLIC_*` changes need a **redeploy**; they are compiled into
the client bundle. Server-only variables take effect on restart.
