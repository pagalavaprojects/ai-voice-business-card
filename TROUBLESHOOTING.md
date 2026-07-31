# Troubleshooting

Real failure modes hit while building and operating this app, with the actual
root cause rather than the symptom. Ordered roughly by how often they bite.

---

## Voice

### The card loads but clicking the mic plays no audio

The widget silently falls back to a text-only demo mode when
`NEXT_PUBLIC_VAPI_PUBLIC_KEY` is missing or is a placeholder
(`src/features/voice/hooks/useVapiSession.ts`).

**Tell them apart:** a real call always triggers the browser's *"use your
microphone"* permission prompt. Demo mode never does.

Note the *public* key is a different credential from `VAPI_API_KEY` (the
private, server-side one). The widget needs the public one.

### The call connects, then hangs at "Connecting WebRTC…" forever

Content-Security-Policy blocking Daily.co. Vapi's SDK proxies the actual WebRTC
media through Daily, so `connect-src` must allow `https://*.daily.co` and
`wss://*.daily.co` alongside `api.vapi.ai` (`next.config.mjs`).

The tell is a CSP violation in the browser console mentioning
`c.daily.co/call-machine/...`. Vapi's own error handler never fires, so the UI
just sits in "Connecting" with no error.

### The AI speaks a generic greeting instead of the configured one

Vapi speaks `ai_agents.first_message` **verbatim, before the model or system
prompt run**. If you hear the generic *"Hello, thank you for scanning my
business card"*, the card's real `first_message` never reached the call.

Check in order:

1. `curl localhost:3000/api/public/<companyId>/<employeeId>` — is `firstMessage`
   the text you expect?
2. If not, is the row actually in the database? `npm run verify:db`
3. If the API returns stale text after you changed the database, see
   *"Database changes don't show up"* below.

### The AI ignores its instructions / doesn't know the company

The assembled system prompt didn't reach the call. `GET /api/public/...`
should return a populated `systemPrompt`. If it's `null`, prompt assembly threw
— check server logs for *"System prompt assembly failed"*.

### The AI offers to book a meeting or save details, but nothing is ever saved

Almost always `PUBLIC_BASE_URL`. Vapi delivers tool-calls from its own cloud, so
a `localhost` callback resolves to Vapi's machine and never reaches you.

The app detects this and **disables the tools entirely** rather than letting the
assistant promise something it can't do. Look for this log line:

```
No publicly reachable base URL — voice tools (save_lead, book_appointment) are disabled
```

Fix: set `PUBLIC_BASE_URL` to a public HTTPS origin (`ngrok http 3000` locally,
your domain in production).

Second possible cause: `VAPI_WEBHOOK_SECRET` set to a value that doesn't match
what's configured in the Vapi dashboard — every webhook is then rejected as
unauthenticated.

---

## Database

### Database changes don't show up, no matter how many times you re-seed

Next.js patches the server-side global `fetch` with its Data Cache, and
supabase-js issues its REST calls through that same global fetch — so reads can
freeze at whatever they first returned in a server process.

Already fixed at the root in `src/shared/lib/supabase.ts` (the admin client
forces `cache: "no-store"`). If you add a *new* Supabase client anywhere, it
needs the same treatment or it will silently serve stale data.

**Confirm it's this:** write a marker value straight into the database, then
re-request the API without restarting the server. If the response still shows
the old value, it's the fetch cache.

### `npm run seed:pagalava` says "fetch failed" for every row

`.env.local` isn't being loaded. `tsx` doesn't read it automatically the way
Next.js does — the npm script passes `--env-file=.env.local` for exactly this
reason. Running `npx tsx scripts/seed-pagalava.ts` directly, without that flag,
falls back to the placeholder Supabase URL and every insert fails.

### Duplicate FAQs / services after seeding repeatedly

Fixed: every seeded row now carries a fixed UUID so `upsert(onConflict: "id")`
updates in place. Without an explicit `id`, Postgres generates a fresh one each
run and `onConflict` can never match, so every run inserts duplicates.

`npm run verify:db` checks for this.

### `match_knowledge_chunks` reported missing when it exists

Calling a Postgres function through PostgREST with no arguments makes it look
for a *zero-argument overload*, and the error reads "could not find the
function … without parameters". Call it with its real named arguments
(`target_company_id`, `query_embedding`, `match_count`) to actually test it.

---

## Build and dev server

### `Cannot find module './vendor-chunks/@opentelemetry.js'`

Stale `.next` cache after backend imports changed. Next's dev-mode incremental
compiler doesn't always pick up new server-side dependency graphs.

```bash
# stop the dev server first
rm -rf .next && npm run dev
```

This also happens if **two dev servers run against the same `.next` directory**
— they fight over the same build artifacts. Run one, or give each its own
working copy.

### `Module not found: Can't resolve 'dns' / 'net' / 'tls'`

A client component transitively imported a server-only module (usually
something that pulls in `ioredis`). Typecheck and lint both pass — only
`npm run build` catches it.

Fix by splitting the client-safe part into its own module rather than marking
the import external. Precedent: `promptVariables.ts` was extracted out of
`PromptAssemblyService.ts` for exactly this.

### Playwright: "Could not find a production build"

`playwright.config.ts` runs `next start`, which does not build. Run
`npm run build` first.

### Playwright: "test file should not import test file"

Shared constants can't live in a `.spec.ts`. Put them in a plain module —
`e2e/seeded-card.ts` is the existing example.

---

## Integrations

### An adapter says it's configured but every call fails with 401

A credential is set to a template value that isn't recognised as a placeholder.
`isPlaceholderCredential` (`src/shared/lib/security.ts`) rejects both worded
placeholders (`your-…`, `demo`, `changeme`) and bare kebab/snake-case tokens
(`vapi-api-key`, `openai-api-key`) — but a hand-written value like `abc123`
would pass as real and produce live 401s.

### Emails never arrive

Check the `email_logs` table. Every attempt is recorded with its status and
attempt count, so a `FAILED` row with the provider's error is far more useful
than the absence of an email.

### Queues never process anything

Two separate requirements: `REDIS_URL` must be set, **and** a worker process
must actually be running (`npm run worker`). The web server never processes
jobs itself. In Kubernetes that's `kubernetes/base/worker-deployment.yaml` — a
web-only deploy will enqueue jobs that nothing ever picks up.

---

## Health check

`GET /api/health` does real work — an actual Supabase query and a real Redis
`PING`, not an environment-variable check. It returns `200 healthy`,
`200 degraded`, or `503 unhealthy`, with per-service detail:

```bash
curl localhost:3000/api/health
```

Start here when something is wrong but you don't know which dependency.
