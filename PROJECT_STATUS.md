# Project Status

**AI Voice Business Card — SaaS Platform**

| | |
|---|---|
| **Live** | https://ai-voice-business-card.vercel.app |
| **Repository** | https://github.com/pagalavaprojects/ai-voice-business-card |
| **Demo card** | [`/33333333…/44444444…`](https://ai-voice-business-card.vercel.app/33333333-3333-3333-3333-333333333333/44444444-4444-4444-4444-444444444444) |
| **Last updated** | 2026-08-03 |
| **Completion** | **~95%** — production-deployed; Employee module, Company Settings, dashboard completion, and RAG-to-voice wiring all built this session; blocked only on the pending migrations |

> This file is refreshed after every completed module. If it looks stale
> against the repo, trust the repo and raise it.

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
| Commits | 51 |
| Source | ~20,000 lines TypeScript |
| API routes | 48 |
| Dashboard pages | 14 |
| Database | 26 tables · 39 indexes · 43 FKs · 26 RLS policies (+1 migration pending — Employee module) |
| Migrations | 11 total, **5 pending in production** (see §7) |
| Unit/integration tests | **207 passing**, 1 skipped (documented) |
| Browser tests | **39 passing** across 3 viewports |
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

### Phase 6 — Analytics dashboard *(current)*
New `/dashboard/analytics` with **15 metrics computed entirely from live
Supabase rows**: conversations, leads, qualified leads, conversion rate, average
duration, total voice minutes, calls per day/week/month, lead funnel,
appointment funnel, per-employee performance, tool usage, success rate and
failed calls.

**Five requested metrics were deliberately not built**, because the data does
not exist and a plausible-looking number is worse than an absent one. The page
names each one and why, instead of rendering empty charts that look like bugs:

| Not shown | Why |
|---|---|
| Lead source | No `source` column — every lead arrives via the voice card |
| Most asked questions | `conversations.intent` exists but is never populated |
| Prompt module usage | All six modules run every time — six identical bars |
| AI response latency | Never measured per conversation |

Charts are **hand-rolled SVG, no charting library** — the page lands at 101 kB
first load where recharts would have added tens of kB for three simple forms.
The palette was **validated by script** against the app's real panel surface
(`#13171f`) rather than eyeballed: lightness band, chroma floor, CVD
separation, normal-vision floor and contrast all pass in categorical and
ordinal modes. Employee comparison uses a single hue because it compares one
measure across rows — magnitude, not identity. Status colours always ship with
a text label, and the employee table repeats every charted number.

Also fixed: the **AI Agents page had never been linked in the sidebar** since
the agents module was built, so it was reachable only by typing the URL.

### Phase 7 — Products management module *(current)*
Full CRUD at `/dashboard/products`, replacing SQL-only editing.

Stat tiles (total / active / inactive / featured / added-30d) computed in the
same request as the list, so tiles and table can never disagree. Table has
search, status filter, sort, pagination, row selection, bulk
activate/deactivate/delete, CSV export, duplicate, edit and soft delete.
Create/edit form covers every requested field with drag-and-drop image upload
(real progress via XHR, since `fetch` still cannot observe upload progress).

Decisions worth recording:

- **Additive migration only.** `is_active` defaults TRUE so existing seeded
  products stay visible the moment it applies — deactivation is an explicit
  admin action, never a migration side effect.
- **The public read path filters to active products.**
  `SupabaseKnowledgeRepository` (used by the card, prompt assembly and the
  voice tool) now returns active-only in display order, so deactivating a
  product removes it from every visitor-facing surface at once. The admin
  module reads through a separate `SupabaseProductRepository` that sees
  everything.
- **The form validates with the same Zod schema the API enforces**, so inline
  errors are exactly what the server would reject — it cannot pass locally
  and 422 remotely.
- **Duplicates start inactive.** Duplicating is usually step one of "make a
  variant"; a half-edited copy must not be pitched by the AI.
- **SVG is rejected for product images** (unlike the logo upload) because
  these render on the public card and SVG can carry scripts.
- Bulk operations scope by `company_id` in the WHERE clause as well as by id,
  so another tenant's ids are a no-op even if authorization were bypassed.

New RBAC permissions `read/write/delete:products` follow the leads pattern —
managers edit the catalog, only OWNER/ADMIN delete.

17 new unit tests (schema bounds, slug rules, CSV quoting, form mapping) plus
an e2e test that the products surface is closed to anonymous callers.

### Phase 8 — Services management module *(current)*
Full CRUD at `/dashboard/services`, matching the Products module.

**Built on shared primitives rather than copied.** The Products UI was 964
lines; duplicating it would have produced ~950 more that drift apart the first
time one module fixes a bug the other keeps. Extracted
`CatalogFormPrimitives` (field chrome, drag-and-drop upload with progress,
stat tiles, row actions, public-URL resolver) and a shared
`handleCatalogImageUpload`; both modules now sit on them. ProductForm shrank
497 → 284 lines with no behaviour change and all 17 of its tests still green.
What stayed separate is what genuinely differs: schemas, repositories, routes
and column sets.

Decisions worth recording:

- **Duration reuses the existing `timeline` column.** `services.timeline`
  already held "2–6 weeks to first automation live" for every seeded row and
  was already read by the card, prompt assembly and the `search_services`
  voice tool. A new `duration` column would have split one concept across two
  fields and stranded every existing value in the old one. It stays free text
  because real engagements are quoted as ranges, which a numeric field cannot
  express without implying precision that isn't there.
- **SEO fields were not added.** Services have no individual pages — the card
  is a single client-rendered view — so meta title/description would have had
  nowhere to render. Columns nothing reads are the same dead scaffolding as
  the `rag_chunks` and `workflows` tables already flagged in the audit.
- `services` needed a `currency` column, which products already had; added so
  the card renders service pricing the same way.
- Same active-only public read path, per-company slug uniqueness, bulk
  operations scoped by `company_id`, and inactive duplicates as Products.

**Bug found and fixed:** an axe scan of the catalog form reported a critical
WCAG 4.1.2 failure — the visually-hidden `<input type="file">` inside the
image drop zone was still in the accessibility tree with no label, so a screen
reader announced an unlabelled file control. Fixed in the shared primitive,
which repaired Products and Services at once. Admin forms had never been
axe-scanned before because the dashboard is auth-gated and the existing scans
only cover public pages; `e2e/catalog-forms.spec.ts` now guards the same class
of problem on the public surface, asserting every interactive control carries
an accessible name.

12 new unit tests (schema defaults and bounds, free-text duration, slug rules,
form round-trip without data loss) plus an e2e test that the services surface
is closed to anonymous callers.

### Phase 9 — Employee Management, Company Settings, dashboard completion, RAG-to-voice wiring *(current)*

Four modules built to close out the platform's remaining CRUD and connect two
already-built subsystems that had no path to a live call.

**Employee Management** (`/dashboard/employees`) — full CRUD on the same
architecture as Products/Services: stat tiles, search/filter/sort/pagination,
bulk activate/deactivate/remove, CSV export, avatar upload, and a form
(`EmployeeForm`) that shares `CatalogFormPrimitives` rather than duplicating
it. New migration `20260807` adds `is_active`, `avatar_path`, `voice_id`,
`prompt_override`, `timezone`, `display_order` to `employees` — all nullable
or defaulted, so the module is safe to ship ahead of the migration:

- **Public card visibility uses `is_active !== false`, not `!is_active`.**
  On a database where the migration hasn't applied yet, PostgREST simply omits
  the column — a truthiness check would then read every employee as
  deactivated and 404 every card in production, repeating the exact incident
  from §Incident below. Extracted to `isEmployeeCardVisible()` and pinned with
  a regression test for the missing-column case specifically.
- **Per-employee voice override** (`voice_id`, nullable = inherit) now
  resolves through a shared `resolveCallVoiceId()` used by both the public
  card route and the Vapi webhook, so a browser call and a phone call can
  never speak in different voices. Precedence: employee → agent →
  company Settings default → platform default (`nova`).
- **`prompt_override`** (an employee's own assistant notes) is sanitised and
  fenced into the assembled system prompt like every other admin-authored
  field, placed after the shared behavior module so it refines rather than
  overrides the security guardrails.
- RBAC added `read/write/delete:employees` on the same tier split as
  Products/Services (MANAGER edits, only OWNER/ADMIN removes).

**Company Settings completion** — every field on the page now actually does
something; three were previously write-only:

- `calendar_settings.event_type_id` and `email_settings.sender_name` were
  saved to the database and read by **nothing** — `book_appointment` always
  booked against the `CALCOM_EVENT_TYPE_ID` env var and every email went out
  as "AI Voice Business Card" regardless of what a company configured. Both
  now flow through `ToolRegistry.resolveCompanyDefaults()`, with the env var
  kept as the platform-wide fallback and a settings-lookup failure degrading
  to that fallback rather than losing the booking.
- `voice_settings.default_voice_model` was free text with no validation
  against what Vapi actually accepts; now a `<select>` bound to
  `SUPPORTED_VOICE_IDS`, wired into the voice-resolution chain above.
- Added a **booking-URL field** — the card's "Book Meeting" button was
  already gated on this setting existing, but nothing in the UI let an admin
  set it.
- Added a **Team Members panel** (invite, change role, remove) — the
  `/api/admin/members` API existed with no UI ever calling it.
- Every input became a real `<label>`-wrapped control (the old markup used a
  sibling `<label>` with no `htmlFor`, so no field on the page had an
  accessible name); colour and URL fields validate before save instead of
  producing a generic 422.
- `ResendEmailAdapter`'s From header now sanitises a company's configured
  sender name (strips `<>@",;` and newlines) — untrusted tenant input was
  going to sit in an email header unescaped.

**Dashboard completion** (`/dashboard`) — added **Top Topics** and **Recent
Conversations**, plus CSV export on both new widgets and the existing
Recent Leads table.

- "Top Questions" was requested but is not honestly buildable:
  `conversations.intent` is never populated and transcripts aren't parsed, so
  there is no free-text question log to summarize. **Top Topics** is the
  honest substitute — it counts which tools actually fired across recent
  calls (`search_products`, `book_appointment`, etc.) and ranks them, which is
  real, already-stored data rather than an invented ranking. Extracted to
  `computeTopTopics()` with its own tests, including "an unrecognised tool
  still surfaces under its raw name" so a tool added later isn't silently
  dropped from the widget.
- Recent Conversations joins employee names in one extra query (avoiding an
  N+1) and shows status, duration, sentiment and summary per call.

**RAG-to-voice wiring** — the Knowledge Base page (`/dashboard/knowledge`)
has had a complete pipeline since Phase 2 of the original build-out: upload a
PDF/DOCX/TXT, it gets parsed, chunked, embedded, and an admin-only search
endpoint could query it. **None of that was ever reachable from a live
call** — no tool existed for the assistant to search it, so an admin could
upload and index a document and it would still never inform a single answer a
caller received. Added `search_knowledge_base` to `ToolRegistry`: vector
search when `OPENAI_API_KEY` is configured, text search fallback otherwise,
and an honest `{success: false}` (not a thrown error) when no document store
is wired up or the store errors mid-call — a document-store outage must not
crash the whole tool call when products/services/FAQs can still answer.

Also added a **Policies** section to the assembled prompt: an FAQ tagged
`category: "Policy"` (case-insensitive, substring match so "Policies" also
matches) is now broken out of the general FAQ list into its own
`COMPANY POLICIES` block with an explicit "follow these exactly" instruction
— a refund or cancellation rule deserves more weight than ordinary trivia,
and burying it in generic Q&A gave it none.

**Verified and explicitly NOT built:** cross-call visitor memory and
proactive "customer context" (recognizing a returning caller before they
identify themselves) were both requested in the original brief. Neither
exists today, and neither is a documentation gap — both would need new
infrastructure (a caller-identity mechanism keyed by phone number, a memory
store keyed across calls), which is genuine backend build-out the roadmap
conversation this session opened with explicitly deprioritized. Recorded here
rather than built silently or claimed as done.

58 new unit tests across employee schema/RBAC/voice-resolution, the migration
window's `isEmployeeCardVisible`, `computeTopTopics`, `search_knowledge_base`,
the Settings→booking wiring, the `ResendEmailAdapter` From-header sanitisation,
and the Policies section — all pinning the specific defect each change fixes,
not just the happy path.

### Incident — deploy ahead of migration *(fixed)*
The Services release shipped before migrations `20260805`/`20260806` were
applied to production, and degraded the live card:

- Every public read queries `is_active` / `display_order`, which did not exist
  yet, so the queries errored and the card showed **zero products and zero
  services**.
- The worse consequence was indirect: `PromptAssemblyService` reads through the
  same repository, so its failure made the assembled system prompt come back
  **null** — the live voice assistant was running with no knowledge of the
  company at all. One missing column silently removed the product's core
  capability, and the `.catch(() => [])` guards on the public route meant it
  failed quietly rather than loudly.

The public read path now detects Postgres `42703` (undefined_column) and
retries with the pre-migration query shape. Returning every row matches the
migration's own default of `is_active = TRUE`, so nothing visible before
becomes invisible, and nothing that should be hidden after the migration is
exposed early. The fallback is deliberately narrow — only `42703` triggers it;
a connection failure still throws, because turning a real outage into a
silently empty card is exactly the failure mode this incident was made of.

Verified restored in production: services back on the card, system prompt back
to 4,662 characters, live voice call reaching "Listening", zero console errors.

**Process lesson:** additive migrations must be applied *before* the code that
reads the new columns, not after. Four are still pending — see §7.

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
- Settings fields that saved to the database and were read by nothing
  (Cal.com event type, email sender name) — configurable in appearance only
- a fully-built RAG pipeline (upload → chunk → embed → search) with no path
  from a live call to ever reach it

Each is now either genuinely working or **failing honestly and loudly**.

---

## 6. Completion by area

| Area | % | Notes |
|---|---|---|
| Architecture & code quality | 95% | Clean layering, 0 TODOs, 0 `any` |
| Security | 92% | RLS, RBAC, signed webhooks, distributed rate limiting |
| Database | 88% | Indexed, constrained; 5 migrations pending in production (§7); 2 orphan tables remain |
| Voice pipeline | 92% | Live and verified; per-employee/company voice resolution wired; latency unmeasured |
| Public business card | 95% | Redesigned, WCAG AA, 320–1440px |
| Admin dashboard | 96% | 14 pages real incl. analytics, products, services, employees, completed settings, completed overview |
| Analytics | 78% | 15 metrics + Top Topics + Recent Conversations; 4 still need instrumentation that doesn't exist |
| Knowledge base / RAG | 95% | Pipeline complete AND now reachable from a live call via `search_knowledge_base`; semantic mode inert until `OPENAI_API_KEY` is set (text fallback works today) |
| Booking | 85% | Code correct; per-company event type + sender name now wired; needs Cal.com credentials |
| Email | 80% | Code correct; per-company sender name now wired and sanitised; needs Resend key |
| Employee management | 95% | Full CRUD, voice override, prompt override, card visibility hardened for the migration window |
| Company settings | 95% | Every field now read by something; Team Members panel added |
| Testing | 91% | 207 unit + 39 browser; no load testing |
| Observability | 80% | Config complete; stack never run |
| Deployment | 95% | Live on Vercel, HTTPS, auto-deploy from GitHub |
| **Overall** | **~95%** | Blocked mainly on pending migrations (§7), not on missing code |

---

## 7. Outstanding

### Needs you (blocks nothing else)

**Run `supabase/PENDING_MIGRATIONS.sql`** in the Supabase SQL Editor — `ALTER
TYPE` and `CREATE INDEX` cannot go through the JS client. It is a single file,
split into two blocks that must run in order (Block 1 alone, then Block 2),
fully commented with what each statement does and why the split is required.

Five migrations are pending: `20260803` (appointment status), `20260804`
(hot-path indexes), `20260805` (products catalog), `20260806` (services
catalog), and `20260807` (employee management — `is_active`, `avatar_path`,
`voice_id`, `prompt_override`, `timezone`, `display_order`). Until 20260805/06
apply, the Products and Services pages error on a missing `category` column.
**20260807 is the one exception that is safe to leave unapplied** — the
Employee module was deliberately built so the public card and the assembled
prompt both keep working with the column absent (see Phase 9 above); it only
blocks the module's own admin-side extras (avatar, per-employee voice,
per-employee prompt notes).

> Until the first statement (Block 1) runs, a voice booking attempt errors on
> the unknown enum value.

Once all five are confirmed applied, two compatibility fallbacks should come
out — **not before**:
- `SupabaseKnowledgeRepository`'s `isMissingCatalogColumn` fallback (products/
  services) and its `CatalogMigrationWindow.test.ts`.
- `isEmployeeCardVisible`'s tolerance for an absent `is_active` column can stay
  permanently — it costs nothing to keep and removing it buys nothing, unlike
  the catalog fallback which exists purely for the migration window.

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

1. ~~Analytics dashboard~~ — **done** (Phase 6).
2. ~~Products CRUD~~ — **done** (Phase 7).
3. ~~Services CRUD~~ — **done** (Phase 8).
4. ~~Employee CRUD~~ — **done** (Phase 9): create, deactivate, per-employee
   voice + prompt notes. Account invitation is intentionally separate — that's
   the Team Members panel in Settings (also done this session), not this
   module; an employee *card* and a platform *login* are different concepts
   here (an employee row can exist with no linked user).
5. ~~Company settings~~ — **done** (Phase 9): logo, brand colours, calendar,
   email sender, team roles. Social links and business hours are on the
   Employee module (per-person), not company-wide — that was a deliberate
   placement call, not an oversight.
6. ~~Knowledge base reachable from a live call~~ — **done** (Phase 9):
   `search_knowledge_base` tool.
7. **Lead management** — Hot/Warm/Cold tiers (scores already exist; only
   sorting and filtering are missing), bulk actions, assignment.
8. **Instrumentation for the four unmeasured analytics** — lead source,
   intent capture, per-conversation latency, prompt-module attribution.
   Roughly half a day each; all four need real data capture, not UI.
9. **Live call monitoring**, audit-log writing (`audit_logs` exists with no
   writers), notifications.
10. **Cross-call visitor memory / customer context** — recognizing a returning
    caller and recalling prior conversations. Requested this session and
    deliberately not built: needs a caller-identity mechanism (phone-number
    matching against `leads`) and a memory store, which is new backend
    infrastructure, not a UI gap. Scope it as its own module before starting.
11. Later: multi-agent routing, CRM integrations, billing.

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
| `npm test` | 207 unit/integration tests |
| `npm run test:e2e` | Playwright (build first) |
| `npm run verify:migrations` | Apply migrations to local PGlite |
| `npm run verify:db` | Check the live Supabase project |
| `npm run seed:pagalava` | Seed the demo card (idempotent) |

Further reading: [`README.md`](README.md) ·
[`DEPLOYMENT_CHECKLIST.md`](DEPLOYMENT_CHECKLIST.md) ·
[`TROUBLESHOOTING.md`](TROUBLESHOOTING.md)
