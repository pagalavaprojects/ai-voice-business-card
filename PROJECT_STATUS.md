# Project Status

**AI Voice Business Card — SaaS Platform**

| | |
|---|---|
| **Live** | https://ai-voice-business-card.vercel.app |
| **Repository** | https://github.com/pagalavaprojects/ai-voice-business-card |
| **Demo card** | [`/33333333…/44444444…`](https://ai-voice-business-card.vercel.app/33333333-3333-3333-3333-333333333333/44444444-4444-4444-4444-444444444444) |
| **Last updated** | 2026-08-02 |
| **Completion** | **~86%** — production-deployed, two integrations pending credentials |

---

## 1. What this is

A digital business card reached by QR code. Scanning it opens a page where the
visitor **talks out loud, in the browser**, to an AI version of the person on
the card. The AI knows that company's services, products and FAQs, qualifies
the visitor as a lead, and can book a meeting.

Behind the public card sits a multi-tenant admin platform: companies manage
their AI agents, knowledge base, prompt modules, leads, appointments and
branding.

**Stack** — Next.js 14 (App Router) · TypeScript · Tailwind · Supabase/Postgres
(+pgvector) · Vapi · OpenAI · Cal.com · Resend · Redis/BullMQ · OpenTelemetry ·
deployed on Vercel.

**Architecture** — Clean Architecture / DDD: `domain` → `application` →
`infrastructure`, with `features` and `shared` on top. Dependencies point
inward; repositories abstract Supabase behind interfaces.

---

## 2. Current state at a glance

| Metric | Value |
|---|---|
| Commits | 43 |
| Source | 13,445 lines TypeScript |
| API routes | 34 |
| Database | 26 tables · 35 indexes · 43 FKs · 26 RLS policies |
| Migrations | 8, apply cleanly from scratch |
| Unit/integration tests | **117 passing**, 1 skipped (documented) |
| Browser tests | **27 passing** across 3 viewports |
| Accessibility | WCAG 2.1 AA — zero violations |
| Build | Zero warnings, zero build-time error logs |
| Code hygiene | 0 TODOs · 0 `any` · 0 `@ts-ignore` |

---

## 3. What works, verified in production

Everything below was confirmed against the live deployment, not assumed.

- **Voice calls** — real audio. Verified by driving a real Chromium browser and
  reading back what Vapi's own speech recogniser transcribed from the audio it
  produced.
- **The scripted greeting** — *"Hi. I'm Srinivasan Kandasamy from Pagalava Data
  Analytics. Thank you for scanning my AI business card…"*
- **Lead capture** — a `save_lead` tool call during a live call writes a real
  row to Supabase, linked to its conversation with `tools_called` recorded.
- **Conversation persistence** — transcript, summary, duration, `ended_at` and
  status all stored from the end-of-call report.
- **Webhook authentication** — signed callback tokens; verified 200 with a
  valid token, 401 without.
- **Prompt assembly** — all six modules plus products, services and FAQs reach
  the live call (~4.6k characters).
- **Multi-tenant isolation** — `company_members` + RLS + RBAC across all 28
  admin routes. Anon key returns zero rows.
- **Security headers** — all six present; admin API fails closed at 401.
- **Health check** — real database and Redis probes, plus environment
  validation.

---

## 4. What was built and fixed

Condensed history. Each item was verified before being called done.

### Phase 1 — Audit (baseline)
Found a working voice widget attached to a **static mock** admin console: six
dashboard pages rendering hardcoded arrays, a cross-tenant IDOR with no fix
available (no membership model existed), and Redis/queues/telemetry entirely
faked in memory.

### Phase 2 — Platform build-out (20 phases)
- **Multi-tenancy** — `company_members`, roles, and real RLS replacing every
  permissive `USING(true)` policy.
- **Authorization** — `requireCompanyAccess()` closed the IDOR; one chokepoint
  every admin route awaits.
- **Modules** — Leads, Agents, Knowledge Base, Prompt Builder, Appointments,
  Settings all moved from mock arrays to real APIs and persistence.
- **Knowledge/RAG** — PDF/DOCX parsing, chunking, OpenAI embeddings, pgvector
  similarity search.
- **Prompt Builder** — six modules, versioning, line-level diff, rollback.
  Fixed a real bug where four of the six modules were never read.
- **Infrastructure made real** — Redis cache, BullMQ queues with retry and
  dead-letter, OpenTelemetry tracing, Prometheus metrics. All verified against
  a real Redis binary rather than mocks.
- **Testing** — Playwright with a real Chromium binary, axe-core WCAG scans.

### Phase 3 — Production deployment
- Deployed to Vercel; SSO protection disabled so the card is publicly reachable.
- **Build was failing at 7 minutes**: `redis-memory-server` compiles Redis from
  source and Vercel's image lacks `cmp`. Fixed via committed `package.json`
  config so it holds for CI and preview branches too. Build now **~40s**.
- **Every webhook returned 401.** Diagnosis via truncated hash logging showed
  `x-vapi-secret` arriving *present but empty* — the browser's inline assistant
  config overrides the dashboard's server settings, so no dashboard credential
  could ever apply. Fixed by signing the callback URL server-side; the secret
  never reaches the browser.
- **End-of-call reports 500'd** — Vapi sends duration as a float (`19.488`),
  the column is `INT`, Postgres rejects it outright. One wrong numeric type was
  discarding the entire report. Fixed at the repository boundary.
- Three Vercel-specific defects: `/api/metrics` was statically prerendered
  (frozen metrics forever), knowledge uploads enqueued into a queue Vercel
  cannot drain, and three slow routes lacked `maxDuration`.

### Phase 4 — Public card redesign
Turned a bare avatar/mic/transcript into a real digital salesperson: company
logo, availability status, services with deliverables, products with pricing,
"Try asking" (drawn from real FAQs so every suggestion is answerable), contact
rail (email, phone, WhatsApp, LinkedIn, website), Save Contact vCard, and a
shareable QR of the card's own URL. Bundle **shrank** to 215 kB — QR renders
server-side.

Also caught: the axe-core scan ran before the card loaded, so it may have been
auditing a loading spinner and passing without examining anything real.

### Phase 5 — Production audit and P0 fixes
Two findings that misrepresented the product:

1. **The AI booked meetings that existed nowhere.** `book_appointment` wrote a
   database row and never called Cal.com, then told the caller *"successfully
   scheduled"* and emailed *"your meeting is confirmed"*. `CalcomAdapter`
   compounded it by returning a fabricated booking with a dead
   `cal.com/demo-meeting` URL when unconfigured. Now books for real, or
   captures the intent as **`REQUESTED`** and says a confirmation is coming.

2. **The dashboard home page was entirely fabricated** — hardcoded 1,284
   conversations, 412 leads, *"+18.4% vs last week"*, and two invented people.
   Replaced with real metrics from the company's own rows.

Plus: 500 responses were leaking internals verbatim to the browser (now a
correlation ID), `env.config.ts` defaulted everything to placeholders so
validation could never fail (now real), four missing hot-path indexes, and dead
code removal.

---

## 5. Recurring theme

The defects that mattered most were not crashes. They were **things that
silently pretended to work**:

- a business card that rendered a stranger's identity when lookup failed
- a booking tool that confirmed meetings nobody would attend
- a dashboard reporting invented business metrics
- adapters returning fabricated successes when unconfigured
- alert rules with no scrape config, so alerting was structurally inert
- an accessibility scan that may have been auditing an empty page

Each is now either genuinely working or **failing honestly and loudly**.

---

## 6. Completion by area

| Area | % | Notes |
|---|---|---|
| Architecture & code quality | 95% | Clean layering, 0 TODOs, 0 `any` |
| Security | 92% | RLS, RBAC, signed webhooks, distributed rate limiting |
| Database | 90% | Indexed, constrained; 2 orphan tables remain |
| Voice pipeline | 90% | Live and verified; latency unmeasured |
| Public business card | 95% | Redesigned, WCAG AA, 320–1440px |
| Admin dashboard | 75% | 7 pages real; no analytics/monitoring page |
| Knowledge base / RAG | 85% | Complete — inert until `OPENAI_API_KEY` is set |
| Booking | 70% | Code correct; needs Cal.com credentials |
| Email | 70% | Code correct; needs Resend key |
| Testing | 88% | 117 unit + 27 browser; no load testing |
| Observability | 80% | Config complete; stack never run |
| Deployment | 95% | Live on Vercel, HTTPS, auto-deploy from GitHub |
| **Overall** | **~86%** | |

---

## 7. Outstanding

### Needs you (blocks nothing else)

**Two migrations to apply** in the Supabase SQL Editor — `ALTER TYPE` and
`CREATE INDEX` cannot go through the JS client:

```sql
ALTER TYPE appointment_status ADD VALUE IF NOT EXISTS 'REQUESTED';

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_vapi_call_id
    ON conversations(vapi_call_id) WHERE vapi_call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_conversation
    ON leads(conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_lead_created
    ON appointments(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation
    ON conversation_messages(conversation_id, created_at);
```

> Until the first statement runs, a voice booking attempt errors on the unknown
> enum value.

**Credentials still placeholder** — each disables one capability and is
reported by `/api/health`:

| Variable | Unlocks |
|---|---|
| `OPENAI_API_KEY` | Embeddings → semantic knowledge search (pipeline already built) |
| `CALCOM_API_KEY` + `CALCOM_EVENT_TYPE_ID` | Real calendar bookings |
| `RESEND_API_KEY` | Outbound email |
| `VAPI_API_KEY` | Call-recording archival |
| `REDIS_URL` | Caching + distributed rate limiting |

### Next features (priority order)

1. **Analytics dashboard** — highest value per hour; all data is already
   captured, this is a display layer only.
2. **Products / Services / Employees CRUD** — currently editable only via SQL,
   which blocks self-serve onboarding.
3. **Hot / Warm / Cold lead tiers** — scores exist; only sorting is missing.
4. **Live call monitoring**, audit-log writing, voice-latency instrumentation.
5. Later: AI memory across calls, multi-agent routing, CRM integrations,
   billing.

### Known limitations

- Recording archival cannot work — Vapi serves recordings from a private
  bucket needing its own credentials. Fails gracefully; the original URL is
  retained.
- No load testing (k6 unavailable, no target).
- Browser coverage is Chromium-only; Safari/iOS WebRTC is the likeliest
  real-world gap.
- RLS is verified against the live anon key but is defence-in-depth — the app
  uses the service-role key, so application-layer authorization is the primary
  control.

---

## 8. Reference

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm test` | 117 unit/integration tests |
| `npm run test:e2e` | Playwright (build first) |
| `npm run verify:migrations` | Apply migrations to local PGlite |
| `npm run verify:db` | Check the live Supabase project |
| `npm run seed:pagalava` | Seed the demo card (idempotent) |

Further reading: [`README.md`](README.md) ·
[`DEPLOYMENT_CHECKLIST.md`](DEPLOYMENT_CHECKLIST.md) ·
[`TROUBLESHOOTING.md`](TROUBLESHOOTING.md)
