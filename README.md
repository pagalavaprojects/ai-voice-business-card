# AI Voice Business Card

A digital business card you reach by QR code. Scanning it opens a page where the
visitor talks — out loud, in the browser — to an AI version of the person on the
card. The AI knows that company's services, FAQs, and knowledge base, can
qualify the visitor as a lead, and can book a meeting.

Next.js 14 (App Router) · TypeScript · Tailwind · Supabase/Postgres · Vapi ·
OpenAI · Cal.com · Resend · Redis/BullMQ · OpenTelemetry

---

## Quick start

```bash
npm install
cp .env.example .env.local          # then fill in real values — see below
npm run seed:pagalava               # creates a demo company/employee/agent
npm run dev
```

Open the seeded card at:

```
http://localhost:3000/33333333-3333-3333-3333-333333333333/44444444-4444-4444-4444-444444444444
```

Click the microphone, allow mic access, and you should **hear** the greeting.

---

## What each credential actually unlocks

The app degrades honestly: anything unconfigured is reported as unconfigured
rather than silently faked. Nothing below is optional if you want that feature
to work in production.

| Variable | Without it | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`<br>`NEXT_PUBLIC_SUPABASE_ANON_KEY`<br>`SUPABASE_SERVICE_ROLE_KEY` | No card loads at all — every page shows "unavailable" | supabase.com → Project Settings → API |
| `NEXT_PUBLIC_VAPI_PUBLIC_KEY` | Widget stays in text-only demo mode. **No audio plays.** | dashboard.vapi.ai → API Keys → *Public* key |
| `VAPI_API_KEY`<br>`VAPI_WEBHOOK_SECRET` | Inbound webhooks unauthenticated (dev only); rejected in production | dashboard.vapi.ai → API Keys → *Private* key |
| `PUBLIC_BASE_URL` | **Voice tools are disabled.** `save_lead` and `book_appointment` cannot fire — see below | Your deployed HTTPS domain, or an ngrok URL locally |
| `CALCOM_API_KEY`<br>`CALCOM_EVENT_TYPE_ID`<br>`CALCOM_WEBHOOK_SECRET` | Booking falls back to a simulated response | cal.com → Settings → Developer → API Keys |
| `OPENAI_API_KEY` | Knowledge base can't embed; search falls back to text matching, no semantic search | platform.openai.com → API keys |
| `RESEND_API_KEY` | Notification emails are logged as failed, never sent | resend.com → API Keys |
| `REDIS_URL` | No caching, and background queues can't run | Any Redis instance (Upstash, Redis Cloud, local) |

### `PUBLIC_BASE_URL` — the one that surprises people

Vapi delivers tool-calls from **its own cloud servers**. If it's told to call
back to `http://localhost:3000`, that resolves to *Vapi's* machine, not yours,
so `save_lead` and `book_appointment` silently never arrive.

The app refuses to pretend: when no publicly reachable origin is available it
withholds the tool definitions entirely and logs why, so the assistant never
promises the visitor a booking it can't deliver.

To test tools locally:

```bash
ngrok http 3000                     # copy the https URL it prints
# .env.local:
PUBLIC_BASE_URL="https://<your-id>.ngrok-free.app"
```

In production, set it to your real domain.

---

## Database setup

Migrations live in `supabase/migrations/` and must be applied **in filename
order**. Either paste each file into the Supabase SQL Editor, or use the
Supabase CLI.

Then verify — don't assume:

```bash
npm run verify:migrations   # migrations apply cleanly (local PGlite, no network)
npm run verify:db           # the LIVE project matches what the app expects
```

`verify:db` checks all 23 runtime tables exist, the pgvector search RPC is
callable, the seeded card is complete (including all six prompt modules), and
no duplicate rows have accumulated from repeated seeding.

---

## How the voice call is assembled

1. Browser loads `/[companyId]/[employeeId]`.
2. It fetches `GET /api/public/[companyId]/[employeeId]`, which returns the
   card data plus the **assembled system prompt**, tool definitions, voice id,
   and the webhook callback URL.
3. `useVapiSession` starts a WebRTC call with that config.
4. Vapi speaks `first_message` **verbatim, before the model runs** — that's why
   a scripted opening lives on `ai_agents.first_message` and not in a prompt
   module.
5. During the call Vapi POSTs tool-calls and the end-of-call report back to
   `/api/vapi/webhook`, which executes them against the database.

The system prompt is assembled by `PromptAssemblyService` from six editable
modules — `identity`, `behavior`, `sales`, `booking`, `security`, `fallback` —
plus the company's products, services, and FAQs. Edit them in the dashboard's
Prompt Builder; every save is versioned and can be rolled back.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm test` | Jest unit/integration suite |
| `npm run test:e2e` | Playwright (needs `npm run build` first, and a seeded DB) |
| `npm run verify:migrations` | Apply all migrations to local PGlite |
| `npm run verify:db` | Check the live Supabase project |
| `npm run seed:pagalava` | Seed the demo card (idempotent) |
| `npm run worker` | Background queue worker (needs `REDIS_URL`) |

---

## Further reading

`ARCHITECTURE.md` · `API.md` · `DEPLOYMENT.md` · `TROUBLESHOOTING.md` ·
`SECURITY.md` · `TESTING.md`
