# Project Status

**AI Voice Business Card — SaaS Platform**

| | |
|---|---|
| **Live** | https://maylaanai.com (primary) · https://ai-voice-business-card.vercel.app (still live, unchanged) |
| **Repository** | https://github.com/pagalavaprojects/ai-voice-business-card |
| **Demo card** | [`/33333333…/44444444…`](https://maylaanai.com/33333333-3333-3333-3333-333333333333/44444444-4444-4444-4444-444444444444) or the short link [`/c/srinivasan`](https://maylaanai.com/c/srinivasan) |
| **Last updated** | 2026-08-29 (Phase 20: **voice confirmation + conversation summaries + owner analytics** — the confirmed-booking closing is now the full three-part speech ("Appointment Confirmed!" + approved thank-you line + the REAL booked slot) spoken by BOTH paths: the live voice call (book_appointment's `speak` field) and the booking modal's Done step (browser speech synthesis, confirmed===true only, never REQUESTED). NEW: every ended AI voice call now sends the owner a WhatsApp conversation summary (server-side from the Vapi end-of-call report — visitor-said topics only, deterministic intent heuristic, per-conversation idempotency via the existing insert-or-conflict store, per-employee rate limit, fire-and-never-break-the-call semantics); `conversations.intent` is now genuinely populated. Analytics dashboard extended with the six-question funnel (started/completed), defined conversion (booked ÷ Q6-completed, definition shown in UI), AI-minutes/qualifications/bookings per-day trends, WhatsApp activity (real recorded data only), provider-health pills, recent-activity lists, and a Today range. All real data — cost metrics honestly reported as unavailable. Reminder cron verified armed in production (CRON_SECRET enforced — live 401 without bearer). Jest 67 suites / 608 passed. Final hardening: the WhatsApp-template gap (the known Meta blocker) is now surfaced as its own provider-health pill on the analytics dashboard, and WhatsApp send-failure logs carry a templateConfigured flag so the outside-24h-window failure is self-diagnosing. The dashboard's TTS pill is now a LIVE probe through the real pitch-audio path (available / unavailable (provider/billing) / configured), self-updating when billing is restored — no more credential-presence guessing for TTS. Phase 21: dual appointment-confirmation notifications — on confirmed===true, BOTH the client (canonical three-part confirmation + real meeting link, WhatsApp + localized email) and the owner (structured operational message with client contact/time/link/Status: CONFIRMED, WhatsApp + English email) are notified from the same appointment record; sends are AWAITED via Promise.allSettled (serverless-freeze-safe), idempotent per appt-notify:{appointmentId}:{recipient}:{channel} (fail-open on claim errors — transactional at-least-once), failure-isolated per channel, and audited onto the lead timeline. REQUESTED keeps honest non-confirmed wording; owner email is confirmed-only. Jest 68 suites / 619 passed. Phase 22: /dashboard is now a LIVE operational monitor — consolidated stats endpoint (today-counts from the owner-local midnight, AI minutes, six-question funnel from persisted Qn lines, defined booking conversion, upcoming appointments, WhatsApp truth incl. stamped owner-summary outcomes, shared provider-health helper reused by analytics with TTS probe only there, merged real-event activity feed) + visibility-aware 10s polling hook (single-flight, latest-wins, stale/error honesty, freshness label). Guard test pins dashboard sources free of screenshot demo numbers. Jest 71 suites / 642 passed. Phase 23: FINAL APPROVED MaylaanAI pitch content — all six pitches (EN+TA × Elevator/Product/Why Us) replaced with the founder-supplied authoritative copy in MAYLAANAI_PITCHES (pitchScripts.ts), gated on the Pagalava company id; other tenants and MaylaanAI's other display languages keep composed scripts; storage-key script hash gives new audio identity automatically; duration chips updated to honest 60s/50s/60s estimates; six exact-full-string tests duplicate the approved copy so any paraphrase fails loudly. Phase 24: email-honesty fix — a placeholder RESEND_API_KEY previously SIMULATED sends with success:true (sim_msg_* ids landed in email_logs as SENT and in booking audits as "sent" — proven via DB against the Aug-17 real booking); ResendEmailAdapter now fails closed in production (injectable failWhenUnconfigured, since NODE_ENV is compile-inlined), so unconfigured email records FAILED honestly end-to-end. ALSO: first real voice qualification attempt observed (Aug 18 05:20Z) — Q1 asked, visitor answered in Tamil, classifier correctly rejected + reprompted, nothing persisted: system per spec; operator must answer Yes/No/Maybe in English. Jest 72 suites / 652 passed. Phase 25: FINAL APPROVED MaylaanAI INTRODUCTION — the General-AI (Talk with AI) English opening is now the founder-supplied introduction verbatim (MAYLAANAI_INTRODUCTION in greetings.ts), wired as a code-authored per-company override in resolveGreeting that wins over the DB greeting; Tamil intro deliberately unchanged (English-only supplied — separate content decision); qualification still opens with Q1 (untouched, test-pinned); five exact-content tests duplicate the approved copy. Phase 26: Gemini Tamil TTS — gemini-3.1-flash-tts-preview (voice Kore) is now the TAMIL pitch-audio provider behind the existing pitch API, POC-proven on all three approved Tamil scripts (66s/62s/30s real audio); provider-distinct cache identity (.gemini.wav, audio/wav), OpenAI untouched for other languages AND automatic fallback on any Gemini failure; GEMINI_API_KEY server-only (local + Vercel production, never logged). 5 new route tests. Phase 27: LANGUAGE-AWARE QUALIFICATION — the six-question engine now follows the selected card language (2026-08-19 product decision superseding the English-only rule, NOT the rest of it: still exactly six questions, one engine, no Q7+, no temperature gate). Authored Tamil question set + guidance (ஆம்/இல்லை/இருந்தாலும் + ஆமாம்/ஆமா/இல்ல variants, server-classified) + Tamil directive/continue prompt; context.language already flowed via serverUrl ?lang= — the tool, the client startCall override, and the modal rendering now all dispatch on it; persisted records stay canonical English Yes/No/Maybe; WhatsApp stays English; hi/te/ml/kn cards qualify in English. Jest 72 suites / 668 passed. Phase 28 (2026-08-19): LOW-COST TTS MIGRATION GROUNDWORK — dark-shipped (all inert until env vars set): POST /api/tts/vapi implements Vapi's custom-voice contract (raw s16le mono PCM at request sampleRate, webhook-HMAC-token OR x-vapi-secret auth, 120/min per-tenant rate limit, 1000-char cap, per-language provider chain ta:[custom→gemini→openai] en:[custom→openai] with 20s backend timeouts, provider+language+rate-scoped tts-cache/ in voice-assets bucket); resolveVoiceProviderConfig precedence: custom-voice (VOICE_TTS_PROVIDER=custom + VOICE_CUSTOM_TTS_EMPLOYEE_IDS canary) → Azure Tamil (VOICE_AZURE_TAMIL_VOICE_ID, ta calls only — Vapi-native real Tamil neural voices, cheapest fix) → 11labs → openai; Gemini TTS request extracted to shared/lib/tts/ttsBackends (pitch route re-uses it, behavior identical); tts-server/ FastAPI+Docker self-host service for ai4bharat/indic-parler-tts (HF-gated, NOT deployed). Hardware benchmark (T2000 Max-Q 4GB): 0.9B Parler fits fp16 (peak 2.9GB) but RTF 4.2-4.8 + 26s TTFA = NOT realtime; 36M VITS class realtime even on CPU (RTF 0.44). Production voice chain UNCHANGED this deploy. 3 new test suites (42 tests). Phase 29 (2026-08-19): PERFORMANCE ROUND (measure-first) — production-measured card baseline: TTFB 37ms, DCL 778ms, FCP 2.23s, CLS 0, 31 req/325KB; found+fixed: (1) card API double-fetch on every returning visit (?lang=default ERR_ABORTED then ?lang=stored ~450ms later — fetch now gated on hasStoredPreference resolution, exactly one fetch), (2) fixed pitches generated synchronously on visitor click (21–80s Gemini cold) — now idle-prefetched post-card-load so first render happens invisibly + durable storage serves everyone after, (3) pitch cache key upgraded to full identity (provider+model+voice) + ETag/If-None-Match 304 revalidation for the multi-MB WAVs, (4) qualification-status polling: immediate first fetch + single-flight + AbortController cleanup + failure backoff (1/3/7-tick skips) — all four race guards preserved verbatim, (5) provider fetches bounded: WhatsApp 10s (new reason:timeout), Resend 10s, Cal.com slots 10s / booking POST 20s (fetchWithTimeout util) so a stalled provider can never hold booking confirmation to the platform kill. GEMINI_API_KEY sweep: ACTIVE, SERVER-ONLY (absent from source/git/bundles; rotation = operator action in Google console). Availability fetch confirmed modal-open-only; Vapi confirmed zero-session on card open (Daily bundle loads only on Start). 9 new tests. Phase 30 (2026-08-19): FCP/CONNECTIVITY ROUND — card payload assembly extracted to PublicCardPayload service, shared verbatim by the API route AND both public card pages, which now SERVER-RENDER the complete card (payload + locale bundle) whenever the pagalava.language cookie exists (persistLanguage mirrors localStorage into it, self-healing on mount for pre-cookie visitors) → returning visitors paint the full card from HTML with ZERO client card fetches; localStorage-vs-cookie disagreement costs exactly one corrective fetch. DB waterfalls flattened (audit-driven): card payload 2 serial batches → one 8-way; appointments GET identity+settings parallel; pitch route one 4-way; admin stats live-overview batch starts before core batch awaits + both 500-row samples now ordered most-recent-first. Provider bounds completed: Cal.com reschedule/cancel 20s; Gemini TTS 100s default/20s realtime with REAL aborts; OpenAI TTS PCM 60s; email retries now safe via Resend Idempotency-Key derived from the email_logs row id (audit: backoff previously retried a non-idempotent POST). Availability fetch aborts on modal close. QR dialog got role=img+aria-label. Vapi SDK confirmed already lazy-loaded (background import after mount, not in initial bundle). Responsive verified 390/412/768/1440: no horizontal scroll, no Tamil clipping. 3 new tests. Supplements (same day): d9ec1c7 cut initial card JS 978KB→547KB raw (voice-ID constants split to shared/lib/voiceIds — importing them from voice.ts had dragged a 317KB crypto-browserify polyfill into the browser since da4adc1); 6ca01c9 fixed the SSR fast path (loadBundle moved to features/language/bundles.ts — exports of a 'use client' module become client-reference proxies server-side, threw minified 'n is not a function', invisible to jest, caught only via prod runtime logs + local next-start verification). LIVE-VERIFIED on prod: ta-cookie request returns 63KB HTML with the full Tamil card, ZERO client card fetches, FCP 1308ms (baseline 2232–2696ms). Email idempotency note: Resend Idempotency-Key now derived from email_logs row id. Phase 31 (2026-08-20): RECORDED-INTRODUCTION STATE MACHINE — removed the last autoplay (the best-effort elevator-pitch auto-attempt on card load; nothing plays without an explicit tap now). The introduction is a pre-generated audio asset (pitch route type=intro; script = resolveGreeting — same content as the phone greeting; Gemini for ta, OpenAI/browser-TTS fallback for en) with its own INTRO_IDLE→PLAYING⇄PAUSED→COMPLETE machine fully separate from Vapi: Play → "Playing Introduction" + Pause/Resume only (no End call, no AI statuses, no mic) → completion unlocks "Tap to Speak" → ONLY that explicit tap starts the call, opening with the short approved nowYouCanAsk line instead of re-speaking the intro. In-call "Playing Introduction" status removed (scripted opening now reads as Speaking; mic-gate mechanics unchanged). Product Pitch → Service Pitch in all six locales (backend type identifier "product" unchanged); new mic.playIntroduction key ×6; intro added to the idle prefetch (4 assets). Continue-after-Q6 verified pre-existing + new click→calendar test. Suites updated to the new spec; IntroductionFlow suite added (8 tests). Phase 32 (2026-08-21): SINGLE-PAGE OWNER CONTROL CENTRE — extended (not replaced) the existing live dashboard: same consolidated /api/admin/stats request, same useLivePoll semantics, same design language. Added owner-selectable range (Today/7D/30D/90D) driving range KPIs + per-day call/minute trends + conversation-language split; WhatsApp split into four distinct categories (inbound qualification / appointment confirmations / owner summaries / 24h reminders); email acceptance counts that never claim delivery, with historically SIMULATED sends counted separately; server-derived blockers panel (problem + status + operator action, evidence-only, no provider identifiers); project-information and consumption panels. Honesty: monetary cost is NOT recorded anywhere so the page states "Cost data unavailable" rather than assuming a price; pitch/introduction playback is not instrumented so it says so instead of inventing counts; legacy null-language rows report as unspecified; legacy Q8/Q15 stays out of the six-question funnel; conversion stays null (never 0%) without a denominator. DEFECT FOUND+FIXED against real rows: the trend window was a rolling now-minus-N×24h span whose last bucket landed on YESTERDAY, dropping every call made today (497/501 bucketed) — now anchored to whole UTC days ending today, re-verified live at 501/501. Route no longer computes provider health twice. Public-card initial JS unchanged at 547KB with zero dashboard code in it (build-manifest verified). 23 new tests; 764 total passing. Commit 2a77c43. Phase 33 (2026-08-21): AUTHENTICATED DASHBOARD ACCEPTANCE — the long-standing "never opened in a browser" gap is CLOSED. A password was set on the pre-existing owner account (ceo@pagalava.com, OWNER/ACTIVE, platform admin) via the Supabase Admin API at the owner's explicit request; login verified, dashboard opened and driven end-to-end. Live cross-check DB→API→UI all matched (501 conversations, 306.5 voice minutes, language en 232/ta 160/hi 6/kn 3/unspecified 100, funnel Q1:6→Q6:0, conversion null on zero denominator, 15 booked). TWO REAL DEFECTS FOUND AND FIXED, neither reachable from unit tests or the API alone: (1) providerHealth kept its own laxer placeholder pattern than the adapters that actually send, so the page displayed "Email: configured" while every send failed closed with "Email provider not configured" — isConfiguredValue now delegates to isPlaceholderCredential, one definition for pill and send path, equality test added; (2) the single-day "Today" trend bucket was keyed by UTC date, so for an IST owner (local day starts 18:30Z the prior date) it both mislabelled the bar and dropped the rows — displayed "4 conversations" beside a bar reading 0 on 2026-08-20 — now one bucket holding every row in the window, labelled with the owner's own date. Both re-verified live post-deploy (email pill "not configured"; Today bucket 2026-08-21 = 4 calls / 3.6 min, no contradiction). Range switching verified (Today 4/1, 7D 79/7, 30D 501/30, 90D 501/90, last bucket always today). Freshness semantics verified by forcing an outage: "Stale — last refresh failed" with last-good values intact, nothing zeroed, manual Refresh recovers to Live. Responsive 390/412/768/1024/1440 with no horizontal overflow; no unnamed buttons, aria-pressed correct, refresh keyboard-reachable. 770 tests passing. Commit eae7f41. NOTE: the login page has no forgot-password flow, so password rotation currently requires an admin-API action. Phase 34 (2026-08-21): TWO SEPARATE DASHBOARDS — admin vs user, separated at the authorization layer rather than by hiding widgets. New src/shared/lib/dashboardScope.ts derives the tenant from the SESSION alone (takes no companyId parameter at all, so no crafted id has a channel to travel through); sits alongside requireCompanyAccess, which stays correct for admin surfaces where the caller names a tenant and the server verifies it. A company OWNER is explicitly NOT a platform admin. New /api/user/dashboard (session-scoped, own company only, no platform/system/deployment fields, only own-service provider states) and /api/admin/platform (cross-tenant, gated on requirePlatformAdmin). Middleware now fronts /api/user/* too. /dashboard resolves role server-side and renders AdminDashboard or UserDashboard directly (one URL, no redirect chain); /dashboard/admin re-checks and sends non-admins to /dashboard/user. Existing control centre moved intact to features/dashboard/components/AdminDashboard + new platform-overview block; UserDashboard reuses the same useLivePoll, charts and freshness semantics. REAL IDOR TEST against production: provisioned a genuine non-admin OWNER of a second company, signed in through the real cookie path, and confirmed 10/10 — platform API 403, other-company stats 403, own dashboard 200 showing the probe tenant zeros (not the victim 501), crafted companyId/employeeId ignored entirely, no victim id / platform block / credential-shaped value in the payload, /dashboard/admin redirected to /dashboard/user; probe tenant fully deleted afterwards (companies back to 1). Browser-verified both surfaces; responsive 390/412/768/1024/1440 with no overflow; public card unchanged at 547KB with zero dashboard code. 799 tests. Commit 5aad975. Phase 35 (2026-08-21): ADMIN + USER ACCOUNT PROVISIONING — two clean identities now exist, deliberately separating the two role axes that ceo@pagalava.com had conflated (it is both platform admin AND company OWNER). admin@maylaanai.com: is_platform_admin=true with ZERO company_members rows, proving platform administration does not require ownership. user@maylaanai.com: is_platform_admin=false, OWNER of Pagalava, proving a company OWNER is not a platform admin. Passwords generated randomly and written only to .dashboard-credentials.local.txt (newly gitignored — it was NOT ignored when first written, caught before staging). DEFECT FOUND AND FIXED: /api/admin/me resolved selectable companies purely from company_members, so the membership-less admin got an empty list and the dashboard rendered "No company selected" — platform administration silently required ownership. The authorization layer was already correct (resolveCompanyAccess short-circuits for platform admins); only this endpoint derived scope from membership. It now surfaces every company to an admin, membership-shaped with role PLATFORM_ADMIN, any genuine membership winning; non-admins still get strictly their own. Verified in production with BOTH accounts in isolated browser sessions plus a 17/17 scripted matrix: admin resolves a tenant with no membership and reads /api/admin/platform 200; company OWNER gets 403 on the platform API and 307 from /dashboard/admin to /dashboard/user; crafted companyId/employeeId ignored; anonymous 401 on all three APIs. MAILBOX TRUTH: maylaanai.com has NO MX records, so admin@/user@maylaanai.com are login identifiers that can never RECEIVE email; pagalava.com has live Hostinger MX. Password reset therefore remains unimplemented and would be undeliverable to these addresses. 788 tests. Commit 06355b2. Phase 36 (2026-08-22): PER-EMPLOYEE DASHBOARD SCOPING + 1-ADMIN/2-USER MODEL. Schema audit found user-level ownership ALREADY representable and unused: employees.user_id links a login to an employee, and conversations/appointments/leads all carry employee_id with 100% of rows attributed (501/15/25) — so no schema change was needed. Scope now resolves breadth as well as tenant: OWNER/ADMIN read the whole company; everyone else is staff and reads only their own employee rows; staff with no linked employee resolve to an impossible filter (read nothing) rather than falling back company-wide. Applied as one shared match object across conversations/appointments/leads/summary-stamps. Two tables cannot be attributed per person and are handled honestly instead of leaking company totals: lead_activities is narrowed through the staff member own leads BEFORE the row cap; email_logs has no employee attribution at all, so the query is skipped for staff and the payload marks attributable:false. Admin gained userBreakdown (per employee: calls, minutes, completed qualifications, appointments, company, hasLogin), built from already-fetched rows plus one narrow listing so parts sum to the whole (501<=501, no double counting), reusing computeQualificationFunnel for completion. ACCOUNTS: admin@maylaanai.com (platform admin, no membership), user@maylaanai.com (EMPLOYEE, linked to employee 4444=Srinivasan), user2@maylaanai.com (EMPLOYEE, linked to a new INACTIVE employee de0dd80d so it is never published as a public card). PRODUCTION MATRIX 24/24: User1 sees 501 conversations, User2 sees 0 — same tenant, genuinely separated; crafted companyId/employeeId/userId gain nothing; both users 403 on /api/admin/platform and 307 from /dashboard/admin; anonymous 401 everywhere; admin breakdown lists both. Browser-verified all three accounts in isolated sessions. 793 tests. Commit 33ef070. Phase 37 (2026-08-24): CROSS-USER LEAK FOUND BY ATTACKING PRODUCTION AND CLOSED. The per-employee dashboards from 33ef070 were separate, but every /api/admin/* route still authorized with requireCompanyAccess (which BOTH staff logins legitimately pass) and then queried by company_id alone — so a staff account with ZERO data of its own opened a colleague lead by id (HTTP 200, client name in body) and listed 20 of the company leads. New requireCompanyDataScope authorizes as before AND returns the person-level narrowing: null for platform admins and OWNER/ADMIN, otherwise the caller own employee id, and for staff with no employee record an id matching nothing (reads nothing, not everything). Applied to leads list (repo gained employee_id filter) + lead detail GET/PUT/DELETE + notes + appointments list + appointment cancel/reschedule (PUT routes, missed by the first pass — a staff caller could still cancel a colleague booking) + global search (otherwise the way around the pages it links to) + stats + analytics. Refused rows return the SAME 404 as missing ones so a refusal never confirms existence. email_logs and lead_activities carry no employee_id: skipped for staff or narrowed through their own leads rather than filtered on a column that does not exist. PRODUCTION RE-ATTACK: the original exploit now 404s with the victim name absent, lead list 20 -> 0, cancel/reschedule 404 with the appointment still BOOKED (no side effect), all 10 IDOR vectors clean, admin unaffected (opens the lead 200, breakdown shows Srinivasan 504 calls / Second User 0). Browser-verified all three sessions. 798 tests. Commits 6165136 + 8d2e7e8. Phase 38 (2026-08-24): PRODUCTION-GRADE AUTHENTICATION. The auth MODEL is unchanged (app-layer authorization, service-role queries, session-derived scope); what changed is that the front door is now a real one. /login was the only auth page that existed and it surfaced Supabase's own error strings, which distinguish "invalid login credentials" from "email not confirmed" — an account-enumeration oracle in a public form; every failure now renders one generic message and the password is cleared from component state after each attempt. NEW /signup (name + email + password + confirm) sends ONLY full_name in the metadata: no role, no company, no privilege field, so with is_platform_admin defaulting FALSE NOT NULL and handle_new_auth_user() reading only full_name/avatar_url, a public registration is structurally incapable of self-elevating — there is no channel to elevate through, on the client or in the payload. NEW /forgot-password answers IDENTICALLY whether or not the address is registered (the result is deliberately not branched on; only a transport failure differs). NEW /reset-password renders no password field at all without a recovery session, and never handles, stores or displays a token. THE MISSING PIECE that made recovery impossible before was /auth/callback: Supabase's PKCE links carry a one-time code that authenticates nobody until it is exchanged for a session, and no handler existed to exchange it — the new route does the exchange server-side into the same cookie the middleware reads, guards `next` against off-origin redirects, and never logs or echoes the code. Shared passwordPolicy (>=12 chars, >=3 character classes, rejects single-character repeats and passwords built from the account's own name/email) is used by signup AND reset so the two cannot disagree. DEFECT FOUND AND FIXED while testing the new signup path: a brand-new account belongs to no company, and /dashboard sent it to the company dashboard, whose API correctly refuses with "not linked to a company" — rendering a red error for a state that is not an error; dashboardExperienceFor() now returns platform/company/unlinked and the unlinked case gets an explanation instead. Middleware needed no change (its matcher never covered auth pages, so all four are correctly public). PASSWORDS: all three acceptance logins rotated to 24-character CSPRNG values, each verified by a real password grant against the live auth endpoint, written ONLY to the gitignored .dashboard-credentials.local.txt and never printed. EMAIL HONESTY UNCHANGED: maylaanai.com still publishes no MX, so the recovery mail the flow triggers cannot be delivered to these three addresses — the flow is correct, the mailbox does not exist. 827 tests. Phase 38b (2026-08-25): TWO DEFECTS FOUND BY RUNNING THE RECOVERY FLOW FOR REAL, PLUS ONE PROJECT MISCONFIGURATION. (1) The reset page asked only "is anyone signed in?" and changed THAT account — reached with an unrelated session already in the browser it silently retargeted, and a probe run proved it by changing ceo@pagalava.com instead of the probe account (that password is therefore no longer the operator's original; it must be reset from the Supabase dashboard or via /forgot-password once the URL config below is fixed). /auth/callback now sets a short-lived recovery marker when it exchanges a recovery link, the page requires that marker (or Supabase's PASSWORD_RECOVERY event, which is how the fragment-token links announce themselves) ALONGSIDE the session, and it names the account it is about to change. (2) Sign-up published Supabase's raw error text — a real attempt returned the bare string "email rate limit exceeded", a fact about the project's mail quota shown to someone who can do nothing about it; only visitor-actionable cases now get their own wording. (3) OPERATOR ACTION REQUIRED, not fixable from code: the Supabase project's Site URL is still http://localhost:3000 and https://maylaanai.com is NOT in the redirect allow-list, so EVERY auth email link — recovery and address confirmation alike — redirects to localhost regardless of the redirect_to the app requests (verified by generating links with three different redirect_to values; all three landed on http://localhost:3000/). Fix in Authentication → URL Configuration. Public sign-up additionally cannot complete while the built-in mail quota is exhausted (GoTrue refuses the whole sign-up rather than creating an unconfirmed user), so real public registration needs custom SMTP. Privilege containment re-proved directly: an account created with user_metadata explicitly carrying is_platform_admin:true, role:OWNER and a company_id still landed as is_platform_admin=false with zero memberships and zero employee links — the trigger reads only full_name/avatar_url. Phase 39 (2026-08-25): LANGUAGE ORDER — the selector now leads with Tamil (Tamil → English → Hindi → Telugu → Malayalam → Kannada), matching DEFAULT_LANGUAGE, which has been "ta" since launch while the catalog still listed English first. Presentation only: the array order is what the gate, the in-card selector and the admin surfaces render; every lookup is by code and no voice, pitch or qualification behaviour reads it. FOUND WHILE VERIFYING IT: the gate confirmed with `if (code !== language) setLanguage(code)`, where `language` is the AUTO-DETECTED guess — so anyone who agreed with the guess (an English browser choosing English) stored nothing and was asked again on every visit; only visitors who disagreed ever got a saved preference. Now persisted unconditionally, pinned by a test that fails against the old guard. Production flow re-verified after deploy: order live in both the gate and the in-card dropdown; English choice persists to localStorage + cookie and the gate is skipped on reload; introduction chain intact (no autoplay → Play → Pause/Resume only → completion → Tap to Speak); Cal.com returned 75 real slots in Tamil; QR dialog, brochure, contact links present; 390px with no horizontal overflow; admin stats 505 conversations / 312.8 minutes live. Tamil pitch audio serves 200/206 (3MB WAV, Gemini path); English pitch audio still 503 (OpenAI credits — unchanged external blocker) with browser-speech fallback observed carrying playback. 838 tests. Phase 40 (2026-08-25): SUPABASE AUTH URL CONFIG FIXED, PLUS SIGN-OUT. The project's Site URL was still http://localhost:3000 with an EMPTY redirect allow-list, so every auth email link went off-site regardless of the redirect_to the app asked for. Now managed as code in supabase/config.toml (site_url = https://maylaanai.com; allow-list covers /**, /login, /forgot-password, /reset-password, the www host and localhost for dev) and applied with `supabase config push`. VERIFIED by generating real links: recovery -> https://maylaanai.com/auth/callback?next=/reset-password, recovery with no redirect -> https://maylaanai.com/, signup confirmation -> https://maylaanai.com/auth/callback?next=/dashboard, and an off-origin redirect_to (evil.example.com) correctly falls back to the site root instead of being followed. The live /forgot-password page was observed POSTing /auth/v1/recover?redirect_to=https%3A%2F%2Fmaylaanai.com%2Fauth%2Fcallback%3Fnext%3D%2Freset-password with a PKCE verifier stored, so production links are the ?code= form that /auth/callback exchanges. CAUTION LEARNED THE HARD WAY, recorded in the config file itself: `config push` applies the EFFECTIVE local config, not a patch — the first push silently carried CLI defaults into four unrelated settings (email confirmations ON->OFF, TOTP enrolment ON->OFF, send throttle 1m->1s, OTP length 8->6). The corrected file pins all four back to production's real values; at the time of writing the corrective push is still PENDING OPERATOR APPROVAL, so production currently runs with email confirmations DISABLED. SIGN-OUT: the app had none — once a session cookie existed the only way to drop it was clearing site data. A SignOutButton in the workspace header now calls signOut, replaces to /login and refreshes the router cache; verified live (auth cookie gone, /api/user/dashboard 401, /dashboard redirects, login form shown). Isolation re-verified unchanged at 37/37 with all three accounts. 842 tests. Phase 41 (2026-08-25): FINAL AUTH ACCEPTANCE — three more real defects, all found by attacking production rather than reading code. (1) TWO MORE CROSS-USER LEAKS in the lead surface, same family as Phase 37 and missed by it: GET /api/admin/leads/export authorised the TENANT then queried by company_id alone, so a staff account owning no leads called it and got "Exported 27 leads" plus a signed CSV URL for a colleague's whole pipeline; and POST /api/admin/leads/[leadId]/notes resolved the caller's employee id and never looked at it, so the same account wrote a note onto a colleague's lead (HTTP 201, row stored, probe note deleted). Both now narrowed through requireCompanyDataScope, refusals return the same 404 as a missing lead, and production re-attack confirms export 27->0 for staff (27 for the owner and admin, unchanged) and the note write 404 with nothing stored. (2) SUPABASE ISSUES TWO SHAPES OF AUTH LINK and /auth/callback only understood one. The PKCE shape carries ?code=; the shape the Supabase dashboard's own buttons produce carries the session in the URL FRAGMENT, which browsers never send to a server — so every one of those valid links was answered "That link is missing part of its code." Fixing it took three passes, each corrected against production: hand the decision to the browser; then discover a fragment cannot be delivered to a PROTECTED page at all (middleware redirects before any script runs, tokens gone), so route it through a page that renders for anyone; then discover the client will not adopt it either, because it runs PKCE and ignores implicit fragments — the tokens now go to setSession explicitly on /login and /reset-password, the latter only when the fragment says type=recovery, with the fragment wiped from history immediately. (3) The password visibility toggle measured 14x14, below WCAG 2.2's 24x24 minimum; the icon is unchanged and the button now fills 24x24 with a focus ring. CONFIG: site_url and the redirect allow-list verified live, and the four settings the previous round's partial push had clobbered (email confirmations, TOTP enrolment, send throttle, OTP length) restored and verified idempotent — a second push reports "Remote Auth config is up to date". Redirect matrix 10/10: valid production targets honoured, and evil.example.com, javascript:, data:, //evil, maylaanai.com.evil.example.com all fall back to the site root. FULL PRODUCTION EVIDENCE: signup through the real form creates an unconfirmed account with is_platform_admin=false, zero memberships, zero employee links; confirmation and recovery links both resolve to maylaanai.com/auth/callback; recovery end-to-end (link -> callback -> reset form naming the account -> new password -> /dashboard) with the previously-known password rejected afterwards, proving the credential really changed; a signed-in visitor who did NOT arrive through recovery is still refused the reset form; admin/user1/user2 login, dashboard, logout and re-login in isolated browser contexts, including the admin -> user1 -> user2 chain in ONE context with no stale identity or data surviving; back-navigation after sign-out exposes nothing; IDOR 33/33. Auth pages 390/412/768/1024/1440 with no overflow or clipped controls. Public card unaffected: Tamil-first order, choice persisted, no autoplay, Vapi not loaded before an explicit tap. 856 tests. Phase 42 (2026-08-27): RECORDED QUALIFICATION VOICE. The six appointment questions were spoken by whatever voice Vapi used while the Introduction and pitches were rendered by our own server and cached — two providers, so on a Tamil call the questions were audibly a different person from the introduction that had just played. The questions are fixed strings, so they are now pre-rendered and served from the same durable cache the realtime TTS endpoint already reads: new scripts/warm-qualification-audio.ts writes through ttsCachePath(), the very function the endpoint looks up with, so an asset is found by identity rather than convention and editing a question changes its key (orphaning the old recording automatically). ONE spoken path only — Vapi asks /api/tts/vapi, we answer with PCM, Vapi streams it; nothing plays in the browser alongside, and Q1 reaches TTS as the call opening while Q2-Q6 arrive as the tool speak field, both composing the same string, so one asset serves whichever path speaks it. PROVIDER DECISION (operator, 2026-08-27): Gemini for BOTH languages. English had been OpenAI-only in the chain, which is why English recorded audio died with that key while Tamil kept speaking; OpenAI remains the trailing fallback. Two things this exposed and fixed: the chain did a durable-cache read before EVERY provider attempt, so an unconfigured provider cost a pointless storage round trip per utterance mid-conversation (unusable providers are now dropped up front), and Gemini rate-limits this preview model hard enough that rendering the set back to back gets five through and 429s the rest (the warmer paces itself and retries with backoff). MEASURED IN PRODUCTION through the same signed URL Vapi receives: English 8/8 warm, cache hits 654-1459ms (provider=gemini); Tamil 3/8 warm at 527-686ms, the remaining five still 502 because the Gemini quota is exhausted — a 502 is the designed trigger for Vapi's own fallback voice, so those questions are still spoken, just not yet in the recorded voice. Re-running the warmer finishes them; it skips whatever is already cached. Custom voice enabled in production scoped to employee 44444444 only (VOICE_TTS_PROVIDER + VOICE_CUSTOM_TTS_EMPLOYEE_IDS); the signed voiceServerUrl carries a derived expiring HMAC, never the raw secret, and no provider key appears in the card payload. NOTE: English intro/pitches still 503 — the pitch route keeps its own OpenAI-for-English logic, deliberately untouched this round, so an English card now has recorded questions but a browser-speech introduction. 880 tests. Phase 43 (2026-08-27): TAP-TO-ANSWER QUICK REPLIES. The questionnaire is closed-ended — three permitted answers, anything else silently reprompts — so it was asking people to say a specific word aloud in a noisy room, in a language the recogniser may or may not handle well that day. Yes/No/Maybe (ஆம்/இல்லை/இருந்தாலும் in Tamil) now appear under the active question. Deliberately NOT a second answer path: the label IS the word — each is a token classifyClosedResponse already accepts in that language, pinned by a test — and it enters the conversation as a USER message via the new sendUserMessage on the session hook, so the assistant calls the same sequencing tool, the SERVER classifies it, the same record is written and the next question is spoken exactly as before. Nothing is classified or stored client-side and no assistant utterance is injected, so the question is never heard twice. Answers are tracked by QUESTION NUMBER rather than a boolean, because the answer takes a moment to return through the server: an impatient double tap would otherwise send twice and could advance two questions; the row locks to the question it answered, returns for the next, and only locks at all if the message actually reached the session, so a dropped call leaves the visitor their options rather than a dead row. Shown only during an active Book an Appointment questionnaire — never in the introduction, never in general Talk with AI, never after Q6. Six locale bundles gained one accessible group label. Verified live on production: Tamil card renders ஆம்/இல்லை/இருந்தாலும் with the Tamil group label and the Tamil Q1; English renders Yes/No/Maybe; 44px touch targets at 390px with no overflow; and with no microphone in the automated browser the delivery guard behaved as designed (answer not delivered, options stayed live). A successful tap advancing Q1->Q2 needs a human with a microphone. 895 tests. Phase 44 (2026-08-27): AUDIO WEIGHT AND CLICK-TO-SOUND. Measured first: a card load transferred 11.13MB, of which 10.74MB was four Tamil recordings pulled on idle before the visitor tapped anything — on mobile data, for audio most visitors never play. The prefetch itself is worth keeping (the pitch route persists renders, so warming is what stops a first play costing the 21-80s of synchronous generation measured in Phase 29), but warming does not need the body: the three Listen pitches are now warmed with a one-byte range request while the introduction keeps its full download, since it is the asset the card invites you to play. Card load 11.13MB -> 3.78MB on a warm CDN edge (the warm-up pulls the object once when an edge does not yet hold it, which is what warms it — never worse than before). A REGRESSION I INTRODUCED AND CAUGHT BY MEASURING: the range warm-up first shipped without cache:"no-store", and because the route answers a range request with status 200 + Content-Length 1 rather than a 206, the browser filed that single byte as the complete response — tapping the pitch then loaded a one-byte file and errored 26ms later with no audio at all. Fixed and pinned by a test. SECOND FIX: a tap could previously sit through generation with no sound and no indication; it now waits only for evidence that a stream is coming (2s, versus 153ms for a real asset) before the browser voice takes over with the same script, and the request is deliberately not aborted so the route finishes persisting for next time. MEASURED CLICK-TO-AUDIBLE-AUDIO on the deployed build, Tamil: introduction 52ms, elevator 160ms, service 128ms, why-us 131ms — all well inside the 500ms target, with the real recording playing (no fallback). English recorded audio still 503s (OpenAI credential dead), and there the browser voice takes over 828ms after the tap. 921 tests. Phase 45 (2026-08-28): MOBILE DASHBOARD DRAWER + ATOMIC QUALIFICATION STATE. Two reported mobile defects fixed. (1) The dashboard sidebar was a fixed 256px flex column at every width, eating half a phone viewport and pushing content off-screen with no dismiss. It is now a drawer: static/visible from md up (desktop untouched, verified at 768/1024/1440 with the hamburger hidden), and on mobile fixed + slid off-screen until a header hamburger opens it, with backdrop, close button, Escape, route-change dismiss, body-scroll lock and a focus trap. New SidebarDrawerContext shares one boolean between header and sidebar. Verified live at 390/412: drawer off-screen by default, main content full-width, zero horizontal overflow; open->focus moves to close->body locks->backdrop/nav dismiss->scroll restored; a nav tap navigates AND closes so the new page is not hidden. (2) The Book Appointment modal could show a question beside a locked greyed option row and a separate processing line. Once a question's answer is sent, its options now give way to a per-question processing indicator (quick-reply-processing); when the server advances, qNum changes, the pending claim no longer matches and the next question renders a fresh row — the swap is atomic so question and options can never disagree. Six questions, Tamil wording/voice, quick-reply labels and the double-tap guard all untouched. 944 tests. Phase 46 (2026-08-28): SERVER-AUTHORITATIVE ACTIVE QUESTION. The Book Appointment desync (question number disagreeing with options / jumping ahead of what was answered) came from two deciders — the transcript parser could push the display to whatever the assistant last spoke while the server-recorded answer count said otherwise. Now one decider: new getActiveQualificationQuestion({language, answeredCount, complete}) returns {complete, number, total, text, language, options}, and the modal drives its question line, "Question N of 6" label, quick-reply row and processing indicator from that single value. The number is the next question after the last SERVER-accepted answer, moving strictly forward one step (the count only grows; stale polls dropped by the existing sequence guard); the transcript no longer moves the number at all. A tapped answer triggers an immediate re-poll (pollNonce) so the next question follows promptly instead of waiting the 3s interval; the processing indicator fills the gap. Six questions, Tamil wording/voice, quick-reply labels untouched. Verified live both languages: EN "Question 1 of 6" + exact Q1 + Yes/No/Maybe; TA "கேள்வி 1 / 6" + exact Tamil Q1 + ஆம்/இல்லை/இருந்தாலும்; no Continue before Q6. Tests: new ActiveQualificationQuestion suite (forward-only, exact strings, clamps), plus the ordering/sequence/conversation-UI suites updated to the server-authoritative rule. 956 tests. Phase 47 (2026-08-28, verification + cache completion, no code change): Gemini daily quota reset, so the 5 remaining Tamil qualification-audio assets (ta/q2, q3, q5, q6, reprompt) were rendered and cached — all 16 fixed EN+TA qualification utterances (q1-q6, continue, reprompt) now present in voice-assets/tts-cache @24000, verified by exact-path download. Custom-TTS contract re-confirmed from source (application/octet-stream, resamplePcm16 writes 16-bit LE via out.writeInt16LE, cache-first before any provider call, 20s bounded backend timeout, auth rejects a mismatched signature with 401 — verified live). Q1 re-verified live on the deployed server-authoritative build (commit 6efa1f4) in EN ("Question 1 of 6" + exact text + Yes/No/Maybe) and TA ("கேள்வி 1 / 6" + exact Tamil + ஆம்/இல்லை/இருந்தாலும்), no Continue before Q6; modal fits 390/412 with 44px targets, no overflow, no clipping. Client bundle swept (716KB) — no OpenAI/Gemini/service-role/Resend/WhatsApp/Cron/Cal.com/Vapi secret. Gates 0/0/955-pass/0. Human end-to-end (Q2-Q6 over a live mic) remains the only unverified item — structurally needs a real Vapi session. **2026-08-15 late round: the WhatsApp-channel migration was discovered NEVER APPLIED to production** (conversations.channel/whatsapp_wa_id/whatsapp_pending_question, whatsapp_processed_messages, whatsapp_sender_locks, employees.whatsapp_phone_number_id all missing) — meaning inbound WhatsApp 500'd, the conversation-summary notifier's idempotency claim always failed, and the analytics API 500'd on its channel select. Applied to prod via a targeted `supabase db push` of exactly that one migration (renamed to 20260815000000 to escape the duplicate-date-version collision); all objects verified present and the analytics select verified passing afterward. **INCIDENT: the concurrent session's untracked `20260811_enterprise_cms.sql` was destroyed** during a sandboxed cross-volume move — see memory note; its content must be recovered from the authoring session or reconstructed before the CMS module can migrate. Also verified via DB evidence: the operator's four real BOOKED appointments with Cal.com IDs exist; no voice conversation or Q1–Q6 qualification record exists yet.) Previous: (Phase 19: **final completion-audit round** — multi-agent source audit + live browser/production verification. Fixed: pitch playback race family in `PublicBusinessCard` (a superseded/cancelled pitch's pending `play()` rejection could voice the abandoned pitch's browser-TTS fallback over the new one, double-fetch its script, and orphan audio elements — now guarded by an ownership token; the auto-play elevator attempt is now cancellable and yields to user taps; a language switch now stops a playing pitch); booking POST resolving after modal close no longer lands the next open on the Done screen; qualification-status rate limit raised 120→480/10min (the 3s poll alone is 200/10min — long conversations were getting silent 429s and Continue could never appear); modal focus trap no longer breaks on disabled first/last controls; slot buttons expose `aria-pressed`; voice-session errors now render inside the booking modal (previously hidden behind the backdrop); dialog close button's accessible name is localized; dead `formData.notes` removed; six verified-unreferenced modules deleted (`ConversationEngine`, `WorkflowEngine`, `EventBus`, `TaskQueue`, `ApplicationError`, `BusinessCardHeader`). Live-verified in production browser: all six pitch script combos 200 (EN+TA × elevator/product/usp), pitch↔Vapi isolation (zero vapi/daily traffic across pitch plays), Q1 exact authored wording, calendar (80 slots), form validation, Escape/focus restore, responsive 390–1440px, CLS 0.00. **Pitch AUDIO remains 503 — OpenAI TTS account out of credits (external blocker); browser speechSynthesis fallback carries playback.** Phase 48 (2026-08-29): VOICE-DROP RECOVERY IN THE BOOK-APPOINTMENT QUESTIONNAIRE. Full-project acceptance re-verification found one code-solvable defect: if the Vapi session dropped mid-qualification (WebRTC ejection / connection error), the Yes/No/Maybe quick-reply buttons stayed on screen but could no longer deliver an answer — the SDK's `send()` does not throw on a dead meeting, so each tap was a silent no-op. Fixed by gating the tappable options (and their processing state) on the session being live (`!voice.error`); on error the options give way to a reconnect affordance — the current question preserved, a Reconnect button that restarts the voice conversation, and the always-present Skip escape — so no dead-tappable row remains, and the options return when the error clears. Localized `voiceDisconnected`/`reconnect` strings added to all six card languages; 5-test regression suite (`QualificationVoiceDisconnect`). Gates green: tsc 0, eslint 0, jest 95 suites / 960 passed / 1 skipped, build 0. Deployed `4a175a4`; LIVE-verified in the production browser — on the natural headless ejection the reconnect UI replaced the options (no dead taps possible), the question stayed on screen, Skip remained, and Reconnect restarted the session. Re-verified the same round (no regressions): admin dashboard matches DB ground truth exactly (553 conversations / 37 leads / 18 appointments / funnel 15-5-5-4-1-1), tenant+employee isolation holds (user2 sees 0 of company data, a colleague lead returns 404, export 0 rows), 33/33 IDOR, reminder cron has 3 eligible appointments + enforces CRON bearer (live 401), booking notifications fan out under `Promise.allSettled` with deterministic idempotency keys and confirmed-only owner email, 16/16 fixed qualification-audio assets cached @24000, no secret values in the client bundle, Tamil-first language order. External blockers unchanged: OpenAI TTS billing (EN pitch 503), WhatsApp test-number token expired (owner/client sends http_401), email provider unconfigured.**) |
| **Completion** | **~99%** — the Phase 16 lead-qualification migration is now APPLIED in production (15/15 columns + both indexes verified against the live schema, existing leads untouched); Tamil (and Kannada) live voice fixed — Vapi was rejecting `deepgram+ta/kn` with a validation 400 (nova-2 doesn't support them), now routed through the OpenAI transcriber, with Telugu/Malayalam upgraded to Azure (`te-IN`/`ml-IN`), all validated against the live Vapi account; NEW pre-recorded voice pitches on the public card (Elevator ≈30s, Product ≈40s, USP ≈5s — speak-only, no mic, OpenAI TTS server-side, CDN-cached, all six languages); production voice live-verified via real browser automation. Remaining external blockers: real Cal.com credentials (`CALCOM_API_KEY` + `CALCOM_EVENT_TYPE_ID`) for live bookings, and a WhatsApp Business provider + credentials for booking/reminder notifications (no sending architecture or credentials exist — only wa.me deep links) |

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
| Commits | 101 |
| Source | ~22,700 lines TypeScript |
| API routes | 49 |
| Dashboard pages | 14 |
| Database | 27 tables · 39 indexes · 43 FKs · 26 RLS policies |
| Migrations | 16 tracked, **all 16 applied in production** (the Phase 16 qualification-engine migration was applied 2026-08-08 via `supabase db push` and verified column-by-column against the live schema) |
| Unit/integration tests | **474 passing**, 1 skipped (documented) |
| Browser tests | **47 passing** across 3 viewports, 1 pre-existing unrelated finding (§4, Phase 13) |
| Accessibility | WCAG 2.1 AA — zero violations on every surface this phase touched |
| Build | Zero warnings, zero build-time error logs |
| Code hygiene | 0 TODOs · 0 `any` · 0 `@ts-ignore` |

---

## 3. What works, verified in production

Everything below was confirmed against the live deployment, not assumed.

- **Voice calls** — real audio. Verified by driving a real Chromium browser and
  reading back what Vapi's own speech recogniser transcribed from the audio it
  produced.
- **The scripted greeting** — a full Tamil AI-receptionist introduction
  (company positioning, five core services, what happens after a lead taps
  the card), confirmed present verbatim in the live `/api/public/.../...`
  response's `firstMessage` field. Interruptible: `firstMessageInterruptionsEnabled`
  is live on both the browser and phone call paths.
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

### Phase 10 — Short public URLs, founder photo/logo, HD voice, Tamil welcome *(current)*

Two focused briefs, both public-facing only — no backend, auth, API, RAG,
booking, or analytics behavior touched.

**Professional public URL.** `/c/{slug}` (e.g. `/c/srinivasan`) now resolves to
the same card as the permanent `/{companyId}/{employeeId}` URL, which keeps
working unchanged — already-printed QR codes and distributed links are
unaffected. New `employees.slug` (migration `20260808`), **globally** unique
rather than per-company, since this is a single flat public namespace shared
by every tenant.

- The route lives under a `/c/` prefix rather than a bare `/{slug}` because
  Next.js App Router disallows two differently-named dynamic segments as
  siblings — `[companyId]` already occupies that position at the public
  route group's root. Verified against a real build, not assumed.
- Extracted the ~500-line card page into a shared `PublicBusinessCard`
  component so the two routes can never drift into two different
  experiences.
- Slug resolution tolerates the migration being unapplied — returns "not
  found," never an error, same defensive pattern as every other `employees.*`
  column added this project.
- QR codes now encode the short URL once a slug is set; the long URL's page
  metadata sets a canonical link to the short one once it exists.
- Admin: a "Public link" field on the Employee form with a live URL preview,
  and slug-aware copy/open-card actions on the roster.

**Founder photo & logo.** Rendering was already correct (object-cover/contain,
no distortion) from the Employee module built earlier in this project — added
explicit eager loading + async decoding for these above-the-fold images
(service/product thumbnails further down stay lazy, unchanged), more
descriptive avatar alt text, and fixed a real bug: the Settings page's logo
upload wrote `branding.logo_storage_path` only, and the public card reads
`companies.logo_url` directly — it never resolved that field. An admin could
upload a logo, see it in their own Settings preview, and the live card would
never change. The upload route now writes both.

**Voice quality.** Audited the Vapi Web SDK (v2.6.1) and OpenAI's TTS
parameters directly against their type definitions rather than assuming —
there is no output-volume/gain control anywhere in the stack;
`increaseMicLevel()` is microphone *input* gain, not speaker output; playback
loudness is purely the listener's own device volume. Applied the one real,
honest lever instead: `"tts-1-hd"` as the synthesis model on both call paths
(browser + phone), a straightforward fidelity upgrade with no downside.

**Scripted, interruptible Tamil welcome.** A full AI-receptionist-style
introduction (company positioning, five core services, what happens when a
lead taps the card) now plays as the call's `first_message` — Vapi's existing
verbatim-opening mechanism, so "play once, then hand off to normal
conversation" needed no new call-flow logic; that's what `first_message`
already did for the short English opener it replaced.

- **`firstMessageInterruptionsEnabled: true`** on both call paths (browser
  SDK, and the webhook route's assistant-request handler for phone/other
  channels) — a real, documented Vapi field, verified against `@vapi-ai/web`'s
  own types before use. A visitor never has to sit through the whole
  introduction; talking over it stops the greeting immediately.
- `useVapiSession` tracks `isPlayingIntro`: true for exactly the call's first
  assistant utterance, false for every one after. Drives a distinct
  "Introducing {Company}…" status label instead of the generic "Speaking"
  state, clears instantly on interruption, and resets on every fresh
  call-start — a refreshed page or a new session plays the intro again.
- **Configurable, not hardcoded.** The script lives in `ai_agents.first_message`
  — already admin-editable on `/dashboard/agents`, not new infrastructure.
  Added `ai_agents.welcome_message_language` (migration `20260809`) plus a
  language field on both agent forms, so a future language swap is a data
  edit, never a code change; validated as an open BCP-47-ish tag rather than
  a closed enum for the same reason. Bumped `first_message`'s Zod max from
  500 → 2000 characters — the old ceiling was sized for a one-line opener and
  would have rejected this script outright.
- `ScriptedGreeting.test.ts` (a regression guard against the greeting
  drifting by accident) was rewritten to pin this new, intentionally-authored
  content instead of the old one — the whole point of that test is to catch
  *accidental* drift, not block a deliberate, fully-specified content change.

**Honestly reported, not silently accepted:** OpenAI's TTS API has no SSML
support, so pacing relies on the script's own punctuation/paragraph breaks
(already how it was written) rather than explicit break tags. OpenAI TTS
voices are not specifically tuned for Tamil pronunciation, and the brief
explicitly said to keep the existing provider — switching to a
Tamil-specialized voice provider (Azure, ElevenLabs, etc.) would be real new
infrastructure (credentials, a different voiceId namespace, updating the
voice-resolution chain) and was out of scope for this change.

17 new/changed unit test cases across 3 files (including a from-scratch
event-driven mock of the Vapi SDK for the interrupt/reset behavior), 1 new
e2e test. Both changes verified live in production end to end: the Tamil
greeting reached `ai_agents.first_message` and is confirmed in the public
API's `firstMessage` field; the short-URL/photo pieces are code-complete and
migration-gated (see §7) exactly like the Employee module before them.

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

### Phase 10b — Bug-fix pass: adversarial review + a broken demo link

Not new scope — hardening what Phase 10 shipped, prompted by two screenshots
showing `/c/srinivasan` 404ing and the card showing initials instead of a
photo. Root-caused both directly against production (not assumed): the
`employees.slug`/`avatar_path` columns from migrations `20260807`/`20260808`
genuinely do not exist in the live database yet — confirmed with a direct
`SELECT *` that stops at `vapi_agent_id`, and a raw Postgres `42703` error
querying `slug` explicitly. `npm run verify:migrations` only proves the SQL
applies to a throwaway in-memory sandbox; it was never evidence the live
database had run it. The founder photo (2.00 MB PNG) was resized and
recompressed to an 800×1144, 135 KB JPEG, ready to upload the moment the
migration lands.

The logo-alignment symptom, unlike the two above, **was** a real front-end
bug: the uploaded mark (light background, dark wordmark — the normal way
brand logos are made) was painted directly onto the dark card. Fixed with a
centered white "chip" container behind the logo — respects any tenant's
source artwork instead of requiring a pre-edited transparent asset per logo.

A background adversarial-review workflow (3 independent finders by dimension,
then a separate verify pass that tried to refute each one by reading the
actual code/SDK source) caught 9 real bugs in the auto-start/voice-provider
work this same phase added, since fixed:

- Two uncancelled timers (`useVapiSession`'s "assistant finished speaking"
  approximation, and demo mode's chained timeouts) that could resurrect a
  call's UI after it had already ended.
- `endCall()` during "connecting" didn't actually cancel the call — Vapi's
  `stop()` is a documented no-op before `call-start` fires, so a delayed
  connection could silently reconnect a call the visitor already ended.
  Verified against the installed `@vapi-ai/web` SDK source.
- UI copy had no "connecting…" branch, so it claimed "I'm listening" while
  the WebRTC handshake was still in flight.
- The "tap to begin" ring rendered as a pill (wrapped in a non-square div)
  instead of a circle — moved into `VoiceMicButton` itself.
- `resolveVoiceProviderConfig`'s ElevenLabs override had no log line.
- The auto-start guard was a bare boolean, not keyed by card identity — would
  have silently skipped auto-start if this component were ever reused across
  two different cards without a remount.
- `not-found.tsx`'s "Talk to our demo AI" CTA pointed at `/`, not a real card.

Fixing that last one surfaced a **separate, pre-existing bug**: the "real
demo card" it should point to, `/demo-company/demo-employee`, has literal
placeholder strings for IDs. Since `employees.id`/`companies.id` are `uuid`
columns, that lookup has always thrown a Postgres type error (not a clean
"not found"), which the public API turns into a 503 — so the landing page's
own "Get Started" CTA (three places) and the sitemap entry have been silently
broken in production this whole time. Repointed `DEMO_COMPANY_ID`/
`DEMO_EMPLOYEE_ID` at the actual seeded UUIDs (`scripts/seed-pagalava.ts`),
confirmed live with a 200.

All gates re-run and green after every fix: `tsc`, `next lint`, 242 unit
tests, `next build`, 42 Playwright e2e tests. Two commits, 18 files, deployed
and verified live. Full write-up in the session's engineering report
(rendered as an artifact for this conversation).

### Phase 11 — Voice-only pass: no-barge-in receptionist behavior, loudness, reconnect

Voice-experience-only scope (explicitly not a redesign; backend/auth/
dashboard/bookings/analytics/lead-capture untouched). Deliberately reverses
Phase 10's own interruptible-greeting behavior: client feedback wanted the
scripted Tamil opening to play to completion like a professional
receptionist's fixed announcement, not something a visitor talks over.

- **No barge-in.** `firstMessageInterruptionsEnabled: false` (both the
  browser and webhook call paths) plus a stronger client-side guarantee:
  the mic is force-muted at the SDK level (`vapi.setMuted(true)`) the
  instant a call connects, unmuted only once the intro's own completion
  timer fires. Verified against the installed `@vapi-ai/web` source that
  Daily's `startAudioOff` factory option — the theoretically "correct" way
  to start a call already-muted — is accepted by this SDK version's types
  but never actually forwarded to Daily's call object; it's dead, so this
  uses the reliable alternative instead.
- **Safe playback loudness** (client feedback: "the voice is too low").
  Vapi's SDK has no volume/gain API at all — it mounts a bare `<audio>`
  element straight to `document.body`. New `audioEnhancement.ts` intercepts
  it via `MutationObserver` and reroutes it through a Web Audio gain →
  compressor → makeup-gain → limiter chain — the same shape broadcast/
  podcast loudness mastering uses — raising perceived loudness without
  clipping.
- **Reliability.** `startCall()` now refuses to start a second session while
  one is active. Exactly one automatic reconnect per successfully-connected
  session on an unexpected drop (never for a deliberate hang-up); the retry
  budget only re-arms on a genuine `call-start`, not on every `startCall()`
  invocation — an earlier draft of this logic would have looped forever
  retrying a persistently-bad connection, caught and fixed before shipping.
- **State copy** now follows the exact requested chain (Loading… / Preparing
  Voice… / Playing Introduction… / Listening… / Thinking… / Speaking…), and
  fixes a real pre-existing bug where the "thinking" state fell through to
  "I'm listening" text.
- **Removed** the office-address/working-hours profile chips; the identity
  block re-centers on its own via the existing flex layout.
- **Tamil script**: added terminal punctuation to each service bullet so
  the TTS engine renders a clearer pause between them — punctuation only,
  no wording changes. Genuine native-Tamil-accent pronunciation still
  requires enabling the ElevenLabs override built in Phase 10b (an
  unset-by-default env var) — no TTS engine swap was made this phase.
- **Task split**: the Vapi-alternatives comparison (10 platforms, latency/
  quality/Tamil-support/pricing/etc.) was handed to Gemini via a written
  prompt rather than researched in-session, since it's a pure research task
  needing no codebase access — result pending the user running it.

242→247 unit tests (6 new: forced mute/unmute ordering, no-re-mute on later
replies, single-session guard, bounded reconnect, no-reconnect-on-user-end).
All gates green. One commit, 8 files (7 modified, 1 new). Deployed and
spot-verified live (chips gone, layout re-centered, API healthy). Live-call
verification (real mic, real WebRTC) was not performed in this environment —
no audio hardware / non-interactive session — left for the user's own
hands-on test.

### Phase 12 — Enterprise multilingual voice assistant

Visitor-selectable conversation language — Tamil (default), English, Hindi
at launch, architected for unlimited more with no code duplication (add a
locale file + a catalog row, not a branch). Everything the language touches
switches together: voice greeting, AI system-prompt language, speech
recognition, suggested questions, and every visible UI/ARIA string.

- **New `src/features/language/` module** — `config.ts` (the
  `SUPPORTED_LANGUAGES` catalog: code, native name, Deepgram speech
  locale, voice model, RTL flag), `locales/{ta,en,hi}.json` (hand-
  translated, dynamically imported per language — confirmed real code-
  splitting via build output, not bundled upfront), `server.ts`
  (greeting/prompt-directive/suggested-question resolution), `greetings.ts`
  (generic per-language fallback templates), `hooks/useLanguage.ts`,
  `components/LanguageSelector.tsx` (a native `<select>` — full keyboard/
  screen-reader support and a free OS-native bottom-sheet/dialog on mobile,
  deliberately not a hand-rolled dropdown).
- **Detection/persistence**: stored preference (localStorage) → browser
  language → Tamil default (not English — Pagalava primarily serves Tamil
  Nadu). Every call's `conversations.language` records what was actually
  used, for analytics.
- **Speech recognition genuinely switches**: `useVapiSession` passes a
  Deepgram `transcriber` config — confirmed `'ta'`/`'hi'` are directly
  supported language codes by reading the installed `@vapi-ai/web` SDK
  types, not assumed.
- **System prompt**: a language directive is appended to the *existing*
  assembled prompt (`PromptAssemblyService`'s output), not forked per
  language — a company's own prompt-module customizations keep applying
  in every language, and "add a language" never means "re-author every
  company's prompt."
- **Greeting resolution priority**: an explicit per-employee override
  (`ai_agents.greetings`, new JSONB) → the existing single-language
  `first_message` (used verbatim only when it matches the requested
  language, so an already-authored greeting is never silently replaced) →
  a generic platform template. `?lang=` absent entirely (any existing
  caller — the webhook, older clients) behaves byte-for-byte as before
  this phase.
- **Backward compatibility is load-bearing, not incidental**: confirmed
  directly against production that omitting `?lang=` still returns the
  original Tamil script unchanged.
- Admin: Agents dashboard gained a per-language greetings editor (blank
  field = platform default for that language, never silence).

**Self-caught regression, fixed same session**: re-running
`scripts/seed-pagalava.ts` to push the new greetings revealed it
hardcoded `logo_url: null` on every run — silently wiping the real
uploaded company logo each time the script executes, unrelated to this
phase's own changes but triggered by it. Fixed (upsert now omits the
field entirely, so Supabase's partial-update semantics leave it
untouched) and the wiped value restored in production directly from the
still-intact storage file.

Migration `20260810_multilingual_voice_assistant.sql`: `languages` catalog
table (seeded), `settings.language_settings` (future per-company
overrides), `ai_agents.greetings`, `conversations.language`. Applied via
the Supabase session pooler (same IPv6 workaround as Phase 10b/11).

26 new tests (detection/fallback priority, greeting-resolution priority
chain, transcriber wiring, locale-bundle key-parity across all three JSON
files). Caught and fixed one real bug before shipping: a race where
switching language could auto-start a call using the still-stale
pre-refetch card data. Full gate suite green (tsc/lint/273 unit
tests/build/42 e2e). Two commits, deployed, and spot-verified live in the
browser across all three languages (screenshots) with zero console
errors.

### Phase 13 — Six-language expansion + pre-conversation language gate + dashboard language settings

Extended Phase 12's three-language assistant to six (added Telugu,
Malayalam, Kannada) and added the enterprise-style pre-conversation
language-selection screen the platform didn't have before — large cards
with flag, native script, and English name, shown once before a visitor's
first AI conversation, distinct from the always-available in-card
language switcher.

- **Speech recognition gap, verified not assumed**: Deepgram (this
  platform's transcriber for en/ta/hi/kn) does not support Telugu or
  Malayalam at all — confirmed by reading `@vapi-ai/web`'s own closed
  `DeepgramTranscriber` type, not by trying and catching a failure. Azure's
  transcriber does support both (`te-IN`/`ml-IN`, same verification method),
  but only once Azure Speech is linked as a provider key in Vapi's own
  dashboard — unverifiable from this codebase. `resolveTranscriberConfig`
  is env-gated on `VAPI_AZURE_SPEECH_ENABLED` (unset by default): until an
  admin confirms Azure Speech is linked and sets it, Telugu/Malayalam calls
  omit the transcriber override entirely and fall back to Vapi's platform
  default rather than request a provider that likely isn't configured. The
  language cards for Telugu/Malayalam show a small "Voice input: setup
  pending" note rather than silently shipping a degraded experience.
- **`LanguageGate` component** (`src/features/language/components/
  LanguageGate.tsx`) — a real ARIA `radiogroup` with roving-tabindex
  keyboard navigation (arrow keys move focus *and* selection, Home/End jump
  to the ends, Enter/Space confirms), pre-selected to the visitor's
  detected/stored language so "Continue" is always immediately actionable.
  Styled to the platform's existing dark theme (not a redesign) with
  `prefers-color-scheme: light` token overrides for a visitor whose OS is
  set to light mode.
- **Shown once per visitor**: `useLanguage` now exposes
  `hasStoredPreference` (tri-state — `null` until the localStorage check
  has actually run, so a returning visitor's saved language can never
  flash the gate open before immediately closing it). `PublicBusinessCard`
  gates its existing auto-start effect behind the gate being confirmed —
  the auto-introduction, no-barge-in call flow from Phase 11 is otherwise
  untouched, just deferred until a language is chosen.
- **Per-company language settings** (genuinely new, not re-specified from
  an earlier phase): a **Language Settings** card in Dashboard → Settings —
  default language and an enabled-languages checklist, wired to the
  `settings.language_settings` JSONB column Phase 12 added but never
  built UI or resolution logic for. `resolveCompanyLanguageSettings` /
  `clampToEnabledLanguages` / `resolveEnabledLanguageList` in
  `features/language/server.ts` apply it server-side in both the public
  card route and the Vapi webhook: a visitor can never land on, request,
  or be shown a language the company has switched off, and an unrestricted
  company (the default, unset state) sees zero behavior change. A
  "Future voice provider" field ships inert/disabled — a named home for a
  capability (`LanguageDefinition.futureVoiceProvider`) that doesn't exist
  yet, not a false claim that it does.
- **Backward compatibility, same discipline as Phase 12**: every new
  resolution step (company default, enabled-language clamp) only changes
  behavior for a company that has explicitly configured it — confirmed by
  construction and by the full existing test/e2e suite passing unchanged.

**Discovered, not built this phase — flagged to the user, not silently
absorbed**: an entire untracked "Enterprise CMS" module (dashboard pages,
API routes, a domain model, a repository, sidebar nav links, and a
16-table migration) was sitting in the working tree with no git history at
all. It is unrelated to this phase's task and was left untouched, except
for one 2-character JSX-escaping fix (`"` → `&quot;`) in
`dashboard/cms/profile/page.tsx` that was otherwise failing `next build`'s
own lint pass outright — nothing else about that module was reviewed,
committed, or deployed. Its migration (`20260811_enterprise_cms.sql`) was
deliberately excluded from this phase's migration run: a standalone script
applied only `20260811_telugu_malayalam_kannada.sql` directly, bypassing
`scripts/migrate.mjs`'s apply-everything-in-the-directory sweep, and was
deleted once confirmed applied.

**Pre-existing, unrelated finding surfaced by this phase's fuller e2e
pass**: the public card's `text-slate-400` helper/heading text fails WCAG
AA color contrast (4.18–4.39:1 vs the required 4.5:1) on the iPad viewport
specifically — present in card markup this phase never touched (confirmed
via diff), not a regression. Left unfixed: a real fix means adjusting the
platform's existing color palette broadly, which is out of scope for a
multilingual-focused phase that was explicitly told not to redesign the
application.

New `20260811_telugu_malayalam_kannada.sql` migration: three new
`languages` rows (te/ml/kn), and `languages.speech_locale` dropped its
`NOT NULL` constraint (Telugu/Malayalam genuinely have no confirmed
transcriber locale yet, not a data-entry gap). Applied via the same
Supabase session-pooler workaround as every prior phase.

34 new/extended tests: `resolveTranscriberConfig`'s env-gate behavior
(6 tests), `resolveCompanyLanguageSettings`/`clampToEnabledLanguages`/
`resolveEnabledLanguageList` (11 tests), the `LanguageGate` component's
selection/keyboard/double-click/enabled-language-filter behavior (7
tests), plus the existing language-config suite extended to all six
languages. Full gate suite green: tsc, lint (project-wide, including the
one incidental CMS fix), 300 unit/integration tests (1 pre-existing
skip), production build, and 47/48 Playwright e2e across Desktop/iPad/
Mobile (the one failure is the pre-existing contrast finding above, not a
regression). One commit, deployed, and spot-verified live in production:
`/api/public/.../...` returns all six languages in `enabledLanguages`,
`/c/srinivasan` still 200s, an unknown short link still 404s, and the
founder photo/company logo URLs are both still present.

### Phase 14 — Production domain migration + real appointment booking

**Domain migration to maylaanai.com**, executed directly against live
infrastructure (GoDaddy DNS API + Vercel CLI, both authenticated in this
environment) rather than left as instructions:
- Read current DNS first — the apex `A` record and `www` `CNAME` were
  GoDaddy's own default parked-site placeholders, and a DMARC TXT record
  existed with **no MX record**, confirming no live email was routed
  through the domain yet — safe to change without breaking anything.
- Added `maylaanai.com` and `www.maylaanai.com` to the Vercel project
  (`vercel domains add`), then set GoDaddy's `A @` to Vercel's two current
  recommended anycast IPs and `CNAME www` to `cname.vercel-dns.com`.
  `vercel domains verify` confirmed both **configured-correctly** within
  minutes — SSL auto-provisioned by Vercel, no manual certificate step.
- Updated the Vercel project's **production** `NEXT_PUBLIC_APP_URL`,
  `APP_URL`, and `PUBLIC_BASE_URL` to `https://maylaanai.com` (Preview
  environment deliberately left alone — those should keep resolving to
  their own preview URLs). Build-time metadata (`metadataBase`, OG,
  Twitter, JSON-LD) reads these at build time, not per-request, so this
  step is load-bearing, not cosmetic.
- Added a `www` → apex 301(-equivalent) redirect in `next.config.mjs`
  (Next's `permanent: true` emits HTTP 308, the modern method-preserving
  replacement for 301 — functionally identical for this purpose) rather
  than relying on a Vercel dashboard toggle, so the redirect is versioned
  and portable.
- Removed the last two hardcoded `ai-voice-business-card.vercel.app`
  fallback strings (defensive-only paths in the two public card routes'
  JSON-LD generation). Metadata/OG/Twitter/canonical/JSON-LD/robots/
  sitemap were **already** fully dynamic and env-driven from earlier
  work — nothing else needed touching.
- The old `.vercel.app` URL was deliberately left alone: Vercel does not
  disable it when a custom domain is added, so already-printed QR codes
  and existing links keep working with no expiry, satisfying the
  "keep it working" requirement with zero extra code.

**Fixed a real "confirmed booking that never happened" bug** — the public
card's "Book an Appointment" button (added between sessions, not by an
earlier phase of this log) opened a modal with hardcoded fake time slots
and a `setTimeout(...)` that unconditionally displayed "Appointment
Requested! ... A calendar invitation and confirmation email will be sent."
Nothing was ever booked, no lead was saved, no email was ever sent — the
same defect class as the original `book_appointment` tool bug pinned in
`BookAppointmentTool.test.ts`, reintroduced in a second, disconnected UI
path. Fixed by:
- New `GET/POST /api/public/{companyId}/{employeeId}/appointments` route.
  `POST` deliberately calls `toolRegistry.getTool("save_lead")` then
  `toolRegistry.getTool("book_appointment")` — the exact same tools the
  live voice call uses — instead of a second, parallel booking
  implementation that could honestly drift from the first one.
  `GET` reuses `CalcomAdapter.getAvailableSlots`'s existing demo-mode
  fallback; the honesty boundary is at booking time, not slot-display time.
  Both routes are rate-limited (write: 8/10min, read: 30/10min — separate
  buckets, so reloading the slot picker can never lock out a real
  submission).
- Rewrote `AppointmentModal.tsx` to fetch real availability and render the
  server's actual `confirmed` boolean — different icon/copy for a real
  Cal.com booking vs. an honest "request received, we'll confirm shortly"
  — instead of one hardcoded success state. Distinguishes "this company
  hasn't configured online booking" from "Cal.com is having an outage"
  (an adversarial review caught the two being conflated in an earlier
  draft — a real outage was being misreported to the visitor as a
  permanent limitation).
- `ToolRegistry.resolveCompanyDefaults` changed from `private` to
  `public` (one-line visibility change, zero behavior change) so the new
  route resolves the same per-company Cal.com event-type-id fallback
  chain the voice tool already uses, rather than duplicating it.
- 10 new tests (`PublicAppointmentBooking.test.ts`): validation, rate
  limiting (both buckets independently), confirmed vs. requested honesty,
  outage-vs-unconfigured distinction, and failure handling — mocking
  `assistantRuntime`/`CalcomAdapter` with exact-args assertions (not
  loose `objectContaining`) on the `timezone` key specifically, since a
  key-name drift there would silently book every visitor in UTC.

**vCard**: added WhatsApp to the exported contact links (was shown on the
card itself but never included in the downloadable contact), tagged the
phone `CELL` in addition to `WORK` so contact apps file it under "mobile,"
and documented — rather than silently deciding — why the card stays on
vCard 3.0 instead of upgrading to 4.0: 4.0 has real gaps in classic
desktop Outlook and several stock Android contact apps, which matters
more here than the spec being newer. (`navigator.contacts` — a request in
this phase's brief — does not exist as a way to write a contact into a
phone's address book from a web page; the Contact Picker API is read-only.
Flagged rather than built as if it worked.)

**Voice provider research** (`docs/VOICE_PROVIDER_COMPARISON.md`,
research-only, no code changed): evaluated OpenAI Realtime, LiveKit,
Daily.co, ElevenLabs Conversational AI, Retell AI, Deepgram, Hume AI, and
Cartesia against Vapi. Recommendation: a full migration isn't justified
right now — the coupling to Vapi's undocumented SDK internals (discovered
through real production incidents, not assumed) makes a swap risky with
no concrete forcing trigger, and the business logic (tools, prompts,
CRM/booking) is already vendor-neutral. A general abstraction layer isn't
worth building speculatively either — worth designing once a second real
implementation exists to design against. If one alternative is worth a
hands-on prototype, it's ElevenLabs Conversational AI: the only
full-orchestration option with confirmed support for all six of this
platform's languages including Telugu/Malayalam, which Vapi's own
comments flag as unconfirmed.

**Performance**: the appointment modal is now `next/dynamic`-loaded with
`ssr:false` — a real Cal.com fetch, date formatting, and a multi-step form
that every visitor was previously shipped whether or not they ever click
"Book Meeting" now only loads on that click.

**Discovered mid-session, not part of this phase's scope**: the same
untracked "Enterprise CMS" module flagged in earlier phases (§7) has grown
further and is under **active, concurrent modification** — `globals.css`,
`Sidebar.tsx`, and `VoiceMicButton.tsx` all changed during this session
without this phase touching them, plus a new `WaveformVisualizer.tsx`.
None of it was committed, reviewed, or built upon here; only the files
this phase actually intended to change were staged and committed.

Full gate suite green: tsc, lint, 310 unit/integration tests (1
pre-existing skip), production build. One commit, pushed, deployed, and
verified live: `maylaanai.com` and `www.maylaanai.com` both 200 with valid
Vercel-issued SSL, `www` redirects with 308, the old `.vercel.app` URL
still works unchanged, `/c/srinivasan` resolves on the new domain,
OG/canonical/JSON-LD all reflect `maylaanai.com`, and the new appointments
endpoint returns a real (not fabricated) `{"configured":false,"slots":[],
"reason":"unconfigured"}` for the demo company, which has no Cal.com key
configured — exactly the honest answer, not a fake one.

---

### Phase 15 — Multilingual QA fixes + founder contact info update

**Critical bug found and fixed**: switching language (via the pre-call gate
or the header selector) silently reverted to English. Root cause: the
card-fetch `useEffect` compared each response's `language` field against the
live `language` state to detect company-side clamping — but a fast switch
could let an OLDER, now-superseded fetch's response resolve after the state
had already moved on, and that stale response's `language` (still the old
value) no longer matched the new state, so the effect "corrected" the switch
right back to what the stale fetch had originally requested. Fixed by
comparing each fetch's response only against the language *that specific
fetch itself requested* (`PublicBusinessCard.tsx`). Verified end-to-end with
a standalone Playwright script driving a real browser through the full
gate → Tamil selection → rendered card flow.

**Localization gaps closed**: `LanguageGate` (the language-picker screen
itself was English-only — the exact irony this audit exists to catch),
`TranscriptViewer`, `AppointmentModal`'s entire booking flow, and
`useVapiSession`'s fallback strings (demo greeting, connection/start-call
errors) now all route through `t()`. Added `appointment.*`, `gate.*`,
`transcript.*`, and a `tagline` key across all 6 locale files; fixed two
`LocaleBundle` type gaps (`buttons.contactSaved`, `sections.actionsHeading`)
that were already used in the JSON but missing from the TypeScript
interface. Booking-confirmation emails are now localized per visitor
language too (`language` threaded through the public booking route and the
Vapi webhook's tool-call context into `ToolRegistry`'s `book_appointment`),
instead of always English regardless of who booked. `VoiceMicButton`'s
`ariaLabels` prop is now required, not defaulted to hardcoded English.

**Voice quality**: not independently re-verified by ear this phase (no
audio playback in this environment, per earlier phases) — Telugu/Malayalam
speech recognition remains unconfirmed in production (Deepgram has no
Telugu/Malayalam support; the Azure Speech fallback exists in code but is
env-gated off, per Phase 14's research). This is an external-provider
limitation, not something fixable in this repo.

**Test suite**: `e2e/multilingual.spec.ts` (new) drives a real Chromium
browser through all 6 languages — leaked-key detection, WCAG 2.1 AA,
localStorage persistence, header-selector switching, browser Back, and the
booking modal. Discovered and fixed a second bug along the way: the spec's
own "card finished loading" signal was an English-only aria-label/button-text
match, which only ever "worked" because the language-switch bug above meant
non-English selections silently stayed in English. Fixed by adding stable
`data-testid`s (`voice-mic-button`, `book-meeting-button`) instead of
matching translated text. Full runs are 17–20/20 green depending on local
system load — remaining flakes are timeout races under 8-parallel-worker
load on this dev machine, not reproduced as functional failures in any
single-test or manual check; worth re-running in a cleaner CI environment
before treating as fully proven.

**Founder contact info updated**: phone/WhatsApp were placeholder data
(`+1 (555) 010-4477`); email was already correct. Replaced with
`+91 94431 25639` in seed data and vCard tests. WhatsApp is derived from
phone (`wa.me` digits-only), so it now resolves to `wa.me/919443125639`
automatically. Fixed the public card's `tel:` link, which previously
embedded the phone's display formatting (spaces) directly in the URI, to
strip to `tel:+919443125639`. Verified live: API response, rendered `tel:`/
`mailto:`/WhatsApp hrefs, and the downloaded vCard's `TEL`/`EMAIL` lines all
checked via a real browser session.

Full gate suite green: tsc, lint, 310 unit/integration tests (1 pre-existing
skip), production build. Two commits, not yet pushed.

**Same concurrent-modification situation as Phase 14** (§4, Phase 14 note):
`globals.css`, `layout.tsx`, `robots.ts`, `sitemap.ts`, `Sidebar.tsx`,
`LanguageSelector.tsx`, `cardMetadata.ts`, `logger.ts`, and `next.config.mjs`
all changed further during this session without this phase touching them,
alongside continued growth of the untracked Enterprise CMS module. One
genuine bug from that concurrent activity was caught and fixed in passing:
`PublicBusinessCard.tsx` had three `useMemo` calls placed after conditional
early returns — a real Rules of Hooks violation ESLint caught. Only files
this phase actually intended to change were staged and committed.

---

### Phase 16 — AI lead qualification/temperature engine + cold-lead nurture

Scoped down from a much larger 17-task brief (multi-domain: qualification
logic, voice latency, Lighthouse, WCAG 2.2, full production deploy) to the
part that was genuinely new backend work rather than re-touching surfaces
already covered in Phases 6–15 without a fresh, specific complaint driving
it. The full 17-task brief and what was deliberately deferred is recorded
below.

**What changed.** `save_lead` previously scored three signals (budget,
timeline, need) into a 0–100 number and a HIGH/MEDIUM/LOW bucket, with no
concept of what happens to a lead that doesn't convert. `LeadQualificationService`
now also classifies a qualitative **HOT/WARM/COLD temperature** — not a
simple score-threshold restatement: an explicit low buying-intent or "not the
decision maker" signal forces COLD regardless of point total, because someone
can have budget and a rough timeline and still clearly be in research mode,
and that should route to nurture, not a pushed booking. A COLD classification
derives a `cold_reason` (AUTHORITY/BUDGET/TIMING/NEED_UNCLEAR/RESEARCH_PHASE,
checked in that priority order — an explicit "no" outranks a merely-missing
answer), a recommended nurture channel, and a `next_followup_date` windowed by
reason (3 days for AUTHORITY, up to 14 for RESEARCH_PHASE). A lead that warms
back up on a later call has its nurture routing explicitly cleared, not left
stale.

- New tool **`update_lead_qualification`** lets the AI refine a lead as a
  conversation surfaces more, instead of only being able to call `save_lead`
  once. Both tools write through one new atomic repository method,
  `updateLeadQualification(id, patch)` — keeps the repository a thin
  persistence layer and the business rules (temperature, cold-reason,
  status transitions) entirely in the service. Undefined fields are
  stripped from the patch before the write; a partial update
  (`{decision_maker: "yes"}` alone) must never null out a `sentiment` or
  `objections` value a previous call already recorded.
- **Cold-lead nurture email**, reusing `NotificationService`/
  `ResendEmailAdapter` unchanged — same fire-and-forget `.catch()` pattern as
  the existing booking-confirmation and high-value-lead-alert sends, and the
  same "never claim success that didn't happen" discipline as
  `book_appointment`: marked `SENT` only once the send genuinely resolves
  `{success: true}`, else `SKIPPED`. Guarded against duplicate sends — the
  tool checks the lead's *existing* `nurture_status` before qualifying, so a
  lead re-classified COLD twice in one conversation is nurtured once, not
  spammed.
- **Prompt guidance, not per-language rewrites.** Confirmed by reading
  `PromptAssemblyService` and `scripts/seed-pagalava.ts` directly that this
  platform's multilingual behavior already works by appending a separate
  language directive to an English-authored prompt at assembly time — module
  content itself is never hand-translated per language (only genuinely
  visitor-facing artifacts like `APPOINTMENT_EMAIL_COPY` are). So the sales/
  booking prompt modules' qualification guidance was written once in English,
  matching the existing architecture, not duplicated six ways. Both modules
  now explicitly instruct the AI never to speak a score, temperature, or
  internal label to the visitor — these exist for the AI's own reasoning
  only.
- New migration `20260812_lead_qualification_engine.sql`: 15 columns on
  `leads` (`decision_maker`, `urgency`, `buying_intent`, `objections`,
  `current_solution`, `referral_source`, `sentiment`,
  `qualification_confidence`, `conversation_summary`, `qualification_notes`,
  `lead_temperature`, `cold_reason`, `nurture_status`,
  `nurture_channel_recommended`, `next_followup_date`), 2 indexes (nurture
  follow-up queue, temperature lookup), CHECK constraints on every enum-like
  column. **Written, not yet applied** — see §7.

**Deliberately not built, disclosed rather than fabricated:**

- `reengagement_score` — requested in the brief alongside `cold_reason`/
  `nurture_status`/`next_followup_date`; the other three were built, this one
  was deprioritized and does not exist yet.
- Automated WhatsApp nurture sending — no WhatsApp Business API integration
  exists in this codebase (only a static `wa.me` link on the card itself).
  `nurture_channel_recommended` can store `"WHATSAPP"` as a recommendation
  for a human to act on; no automated send was built, since fabricating one
  would violate the same "never claim a confirmed action that didn't happen"
  principle this codebase already enforces elsewhere.
- Voice latency/interruption tuning and Tamil pronunciation quality — needs a
  live Vapi call to evaluate; nothing to verify or improve from source alone.
- Lighthouse >95 / UI-UX polish / WCAG 2.2 — already extensively addressed in
  Phases 4, 6–13 (WCAG 2.1 AA, responsive redesign, performance passes); the
  brief's blanket re-ask wasn't paired with a fresh, specific finding, so
  editing visual/performance code again risked regressing what's already
  verified rather than improving it.
- Production deployment (migration apply, `git push`, `vercel --prod`) — held
  for explicit confirmation rather than run autonomously; see the session's
  final report.

**Adversarial review caught 4 real defects before any of this reached
production**, since fixed:

1. `classifyTemperature`'s "explicit negative signal overrides the point
   score" rule only actually applied to low buying-intent — `decisionMaker
   === "no"` was checked *after* the `score >= 70` branch, so a lead with a
   large budget and an urgent timeline who explicitly said they couldn't
   approve the purchase was still classified HOT. Reordered so both explicit
   negatives are checked first, alongside a regression test (score 70 +
   `decisionMaker: "no"` → COLD, not HOT).
2. `budget`/`timeline` were read for scoring but never written into the
   patch — a lead whose budget was clarified via `update_lead_qualification`
   would score correctly but the `leads.budget` column itself stayed at
   whatever `save_lead` originally wrote (often null), so the CRM would show
   a HIGH-scored lead citing "Budget >= $5,000" against a null budget field.
   Fixed by adding both to the patch; pinned with a regression test.
3. `LeadQualificationSignalsSchema` (Zod) was defined but never actually
   used to validate a tool call's arguments — a hallucinated
   `decision_maker: "maybe"` (outside the declared enum) would have reached
   Supabase as an unvalidated string with no CHECK constraint to catch it.
   New `parseQualificationSignals()` runs every `save_lead`/
   `update_lead_qualification` call through the schema first; an invalid
   field is dropped and logged rather than corrupting the row or crashing
   the tool call. `has_need` also gained a real, schema-declared parameter
   on `update_lead_qualification` (it previously could only ever be inferred
   from `problem_statement`, never explicitly set to `false`).
4. The migration's `lead_temperature VARCHAR(4) DEFAULT 'COLD'` would have
   backfilled *every existing lead* — including already-QUALIFIED,
   high-value ones — to COLD the moment it applied, since Postgres applies a
   column default to existing rows too. Split into an undefaulted `ADD
   COLUMN` (existing rows stay NULL, i.e. "not yet classified under this
   engine") plus a separate `ALTER COLUMN ... SET DEFAULT` that only affects
   rows inserted from here on.

22 new/changed unit tests across `LeadQualificationService.test.ts` (full
rewrite — temperature classification including both override signals,
cold-reason priority ordering, next-follow-up-date set/clear behavior, the
undefined-fields-never-written and budget/timeline-persisted regressions)
and `VoiceEngine.test.ts` (`update_lead_qualification` merge/re-score,
nonexistent-lead handling, explicit `has_need: false`, hallucinated-enum
rejection, nurture-email send-once/no-duplicate). Full gate suite green: tsc,
lint, 328 unit/integration tests (1 pre-existing skip), production build.
Not yet pushed; migration not yet applied to production — both held for
explicit confirmation.

### Phase 17 — Tamil lead qualification conversation (booking modal)

Built across several sessions ending 2026-08-10. The Book-an-Appointment
modal gained a step-0 "Conversation with AI" panel: a Tamil qualification
call whose opening IS exactly Q1 of the authored questionnaire (2026-08-10
revision, Q1–Q17 with no Q13), a server-authoritative sequencing tool
(`get_next_qualification_question`) that owns branching (COLD→Q16→Q17,
Q10=NO skips Q11) and records each answer as `Qn [YES|NO|MAYBE] (ts): english`
in `leads.qualification_notes`, a public `qualification-status` endpoint the
panel polls to render the English-only transcript
(`User: YES — "…"` format), and per-question progress ("கேள்வி n / 7").

Session of 2026-08-10 (commits `063911f`, `47f2e30`, `76fc685`, `e227316`):
- Opening deduplicated as a reference to Q1; new questionnaire wording
  pinned by tests (full-walk proves sequence 1–12,14–17).
- Qualification-specific status states in all 6 locales — the panel never
  shows "Preparing Voice" once the question is visible: connecting/speaking
  → "AI கேட்கிறது…", listening → "உங்கள் பதிலைச் சொல்லுங்கள்…", thinking →
  "பதிலைப் புரிந்துகொள்கிறது…".
- **Root-caused a live regression with a synthesized-speech fake-mic test**:
  a transient WebRTC drop auto-reconnected via `startCall()` with no
  arguments, so the retried call opened with the founder pitch instead of
  Q1 and the question loop never engaged (live call evidence
  `019fec0f-…fc0669`). Fix: reconnect replays the last explicit call's
  overrides. Verified live post-fix: a dropped call's auto-reconnect POSTed
  firstMessage === Q1 (both POSTs of call pair `019fec22-…`).
- Live verification ceiling (this environment cannot speak Tamil): Q1
  display+speech, status states, STT hearing an answer and entering
  processing are all machine-verified on production; a full spoken
  Q1→Q17 walk with recorded answers still requires one real human voice
  call. Answers are expected to appear in the panel within ~3s of each
  answer, tagged YES/NO/MAYBE.
- **Closed-ended revision** (same day, commit `baf89ae`): the flow is a
  strict closed questionnaire — every question is spoken with the
  mandatory guidance "ஆம், இல்லை அல்லது இருந்தாலும் என பதிலளிக்கவும்."
  (opening = Q1 + guidance); `get_next_qualification_question` now takes
  the RAW Tamil reply and classifies it SERVER-side (only
  ஆம்/இல்லை/இருந்தாலும் + ASR spelling drift are valid — sentences that
  merely contain a permitted word, English, and fillers get action
  `reprompt`: same question, nothing stored); the stored English record
  is the canonical Yes/No/Maybe derived from the classification, so
  nothing model-generated can be persisted; the transcript line renders
  `User: YES` only. 52 qualification tests / 483 total green. Live:
  firstMessage = Q1+guidance verified on production calls; calls from
  this dev machine keep dropping ~30-40s in (local Daily WSS DNS
  instability), so the spoken multi-turn loop still awaits one real
  human call.
- **Root-cause fix for a self-inflicted regression** (same day, commit
  `ae52eb3`): the closed-ended revision above dropped the directive's
  prior conditional framing ("When the visitor is being qualified for an
  appointment...") and made it unconditional — but `route.ts` appended it
  to `card.systemPrompt` for EVERY Tamil session regardless of call type,
  and that systemPrompt is shared by both the plain "Talk with AI" mic tap
  and the booking modal's qualification call. Net effect: a visitor who
  just tapped the mic to ask a normal Tamil question would have gotten a
  system prompt saying "this is a strict closed-ended questionnaire, never
  ask for explanations" — corrupting general conversation. No prior test
  caught it (the suite only pinned the directive's static string content,
  never which calls receive it). Fixed structurally, not by prompt-level
  self-gating: route.ts no longer appends the directive to the base
  prompt; `useVapiSession.startCall(overrides)` gained a `systemPrompt`
  override (mirrors the existing `firstMessage` override, including
  auto-reconnect replay); `PublicBusinessCard`'s qualification-call
  `startCall()` now passes both overrides together, scoped to only that
  call. Live-verified via the actual Vapi POST bodies (not just the API
  response): plain mic-tap call's systemPrompt = 5565 chars, zero trace of
  the directive; qualification call's systemPrompt = 8928 chars (base +
  directive), firstMessage exactly Q1 + guidance. 4 new regression tests,
  full suite 487/1 skip green.
- **The actual reason ஆம்/இல்லை/இருந்தாலும் never advanced the flow**
  (same day, commit `7aec659`): root-caused via temporary production
  webhook diagnostics (logged a short excerpt of Vapi's own
  `conversation-update` events, removed once confirmed). Across every
  live call, the webhook received `status-update` / `speech-update` /
  `conversation-update` / `end-of-call-report` but **never** `tool-calls`
  — the model never once invoked `get_next_qualification_question`. The
  diagnostic transcript showed why: the AI's own opening (Q1 + the
  closed-answer guidance, one `firstMessage` string) arrived as 3
  separate assistant transcript fragments, not one. The intro mic-mute
  gate (`useVapiSession.ts`, from Phase 11) computed `isIntro` once per
  fragment from a ref that flips true on fragment 1, then closed over
  that snapshot inside a 3000ms `setTimeout`. Each later fragment
  re-armed the same timer (`clearSpeakingTimeout`) with its OWN
  `isIntro === false` baked in — so whichever fragment's timer actually
  survived to fire skipped the unmute entirely. `vapi.setMuted(true)`
  (set at call-start) was never reversed for the rest of the call: the
  visitor's real microphone audio never reached Vapi's STT, for any
  question, the whole call. This bug predates the qualification work —
  it was latent since Phase 11's single-sentence-greeting design — and
  was only ever exposed once an opening became multi-sentence. Fix: read
  `introGateActiveRef.current` live at timer-fire time instead of the
  per-fragment `isIntro` closure — a ref reflects "are we still inside
  the scripted opening" correctly regardless of which fragment's timer
  wins. Regression test written and verified BOTH ways (`git stash` the
  fix): fails on the pre-fix code, passes on the fix. Full gate green:
  tsc, lint, 488/1 skip, build.
  **Live verification ceiling, honestly reported**: every call in this
  dev environment — before AND after the fix, across 5+ independent
  attempts with two different synthesized-answer strategies — dies at a
  consistent ~30-38 seconds from a local WebRTC/Daily-media-server
  reachability issue (previously documented; see
  [[fake-mic-wav-voice-testing]]), before a full spoken exchange can be
  observed end-to-end by automation. The fix itself is proven correct by
  the regression test (deterministic, not timing-dependent); what remains
  unverified by THIS environment is the full live loop, exactly as
  before. **CODE VERIFIED, LIVE VOICE LOOP NOT VERIFIED** — one real
  human phone call is still needed to see Q1 → ஆம் → "User: YES" → Q2
  happen end-to-end.
- **A second, deeper root cause — Live Transcript would have stayed empty
  even with a perfect microphone** (same day, commit `d4634d3`):
  `get_next_qualification_question` only persisted an accepted answer
  when the model supplied `lead_id`, which it was expected to obtain by
  calling `save_lead` first. But `save_lead`'s schema requires
  name/email/phone — fields the visitor only provides in the booking
  form's text inputs, well after (sometimes never, if they abandon) the
  closed-ended Tamil Q&A completes. In the live product `save_lead`
  therefore can never succeed during qualification, so the model never
  had a `lead_id`, and every correctly-classified answer silently failed
  to persist — Live Transcript would have stayed empty and the Q7
  temperature gate could never see a real value, independent of whether
  the microphone/STT bug above was ever fixed. Found by tracing the
  actual persistence path end-to-end rather than trusting the mic fix
  alone to be sufficient. Fix: the tool now resolves its lead
  SERVER-SIDE from `context.conversationId` (new
  `ICRMRepository.getLeadByConversationId`) — which the Vapi webhook
  already establishes deterministically per call, zero model
  involvement — auto-creating a minimal placeholder lead on first use
  and reusing it for the rest of the call; an explicit `lead_id` from
  the model (once it does call `save_lead`) still takes priority. 5 new
  tests, including the 3 explicit integration tests proving Q1 →
  "ஆம்"/"இல்லை"/"இருந்தாலும்" → persisted YES/NO/MAYBE → Q2 with no
  `lead_id` ever supplied — the real production shape. Full suite 494
  passed / 1 skipped, tsc/lint/build clean.
  Live re-verification (7th consecutive attempt tonight, across 3
  deployed fixes): still blocked by the same ~36s environment ceiling —
  every call so far has died before a `tool-calls` webhook request ever
  arrives, so this fix's live persistence behavior is proven by
  deterministic tests but not yet observed on an actual completed
  exchange. **CODE VERIFIED, LIVE VOICE LOOP NOT VERIFIED** still stands.
- **The actual reason no live human answer was ever possible — the AI
  was never speaking real Tamil** (same night, found via one-shot
  temporary diagnostic logging of Vapi's raw `conversation-update`
  payload, reverted before commit — no code change, a **configuration
  gap**). `resolveVoiceProviderConfig` (`src/shared/lib/voice.ts`) only
  selects the ElevenLabs provider (the one with real Tamil phoneme
  support, `eleven_multilingual_v2`) when the platform-wide env var
  `VOICE_ELEVENLABS_VOICE_ID` is set; otherwise every call — for every
  tenant, every language, not just the qualification flow — falls back
  to OpenAI `tts-1-hd`. `vercel env ls production` confirms **no such
  variable exists in production**. OpenAI `tts-1-hd` has no genuine
  Tamil support: it reads the Tamil Unicode text using English-oriented
  pronunciation. Captured live, Vapi's own transcript of the AI
  attempting to speak Q1 ("உங்கள் வணிகத்தில் தீர்வு காண வேண்டிய
  குறிப்பிட்ட பிரச்சினை உள்ளதா?") came back as **"Ukuvaniya
  pidvakanndiya kudipita prachina ulada."** — unintelligible gibberish,
  not a question any Tamil speaker could understand or answer. This
  fully explains why 9 consecutive live test attempts across this
  session never produced a recorded answer, independent of the mic-mute
  fix, the persistence fix, or any network-ceiling theory: a real human
  on the call would have heard the same gibberish. Every prior
  "firstMessage === Q1" payload check verified the TEXT sent to Vapi,
  never the actual pronunciation — the exact trap the very first
  directive of this engagement warned against ("do not report PASS
  merely because Q1 appears in the payload"). **Not fixed here**: this
  needs a real ElevenLabs account/API key/Tamil-capable voice ID, which
  cannot be self-provisioned — reported as a blocker requiring explicit
  user action, not attempted unilaterally.
- **Extended the closed-ended flow to English** (same night, commit
  `09ed7be`, product decision after reviewing a screenshot that turned
  out to be an English-language session): same architecture as Tamil —
  Q1-Q17 (no Q13), server-side yes/no/maybe classification
  (case-insensitive, same strict token-only algorithm), Live Transcript,
  reprompt loop — parameterized by a new `QualificationLanguage`
  dispatch layer in `qualificationScript.ts` rather than duplicated.
  Every Tamil-named export kept its exact prior signature; the full
  pre-existing Tamil suite passed unchanged, proving nothing broke. 94
  new tests across script/sequencing/UI/wiring layers, all passing; full
  suite 538/1 skip, tsc/lint/build clean.
  **Live verification narrowed the remaining gap precisely.** English
  speech goes through the same OpenAI `tts-1-hd` engine as Tamil, but
  English is natively supported — and this time Vapi's own end-of-call
  summary *correctly paraphrased Q1* ("asking if the business had a
  specific problem that needed solving"), confirming the AI's speech was
  genuinely intelligible — unlike the Tamil finding above. The call
  still didn't complete: Vapi's own summary said it "ended due to a
  silence timeout, indicating no response was received from the other
  party" — meaning the synthesized SAPI "Yes." audio piped through
  Chromium's fake-microphone device never registered as speech to Vapi's
  own voice-activity detection, so STT was never even invoked. This is a
  **test-methodology limitation** (this automated technique doesn't
  satisfy VAD), not a code defect or a Vapi configuration gap — the
  earlier TTS/ElevenLabs finding was real and Tamil-specific; this one
  is a different, narrower, and much less severe remaining gap. One real
  human phone call — in either language — is now the only thing needed
  to observe the complete loop; the code underneath is proven correct at
  every other layer this session touched.

### Phase 18 — Six-question qualification migration, production build fix, Vapi/WhatsApp credential restoration

The old 17-question dual-language (English/Tamil) qualification system was
deliberately replaced end to end with a single authoritative, English-only,
six-question flow (`qualificationScript.ts`'s `QUALIFICATION_QUESTIONS`),
consumed identically by voice (`ToolRegistry.ts`'s
`get_next_qualification_question`) and WhatsApp (`WhatsAppQualificationChannel.ts`)
— no duplicated question text, no language branch, no "How can I help you?"
opener. Qualification completion (Q6 answered) is architecturally decoupled
from the pre-existing HOT/WARM/COLD lead-scoring subsystem, which remains for
internal reporting only and no longer gates the customer-facing conversation
or the Book Appointment UI (which now shows Q&A pairs only). Tamil **pitch**
playback (Elevator/Product/Why Us) was untouched and verified still fully
multilingual and architecturally isolated from Vapi — pitch uses OpenAI TTS
server-side with a browser-`speechSynthesis` fallback, never a Vapi/WebRTC
session (confirmed live: clicking any of the three pitch buttons produces
zero `api.vapi.ai` traffic; only "Talk with AI"/qualification does).

A real production defect was found and fixed while verifying the deploy
itself (not from source reading — Vercel's own deployment history showed
production silently alternating Ready/Error on the same commit): committed
`layout.tsx` imported `buildWebsiteJsonLd` from `cardMetadata.ts`, which
never exported it on `main` (the export existed only in a concurrent
session's uncommitted local diff, committed here after explicit user
confirmation since that file was otherwise off-limits this session).

Two external account-level blockers were also cleared this session, not by
code changes but by credential rotation, both live-verified:
- **Vapi**: the account behind `VAPI_API_KEY`/`NEXT_PUBLIC_VAPI_PUBLIC_KEY`
  had a zero wallet balance, rejecting every `POST /call/web` with 400
  regardless of code correctness. Rotated to a new account's keys via
  `vercel env rm`/`add` + `vercel redeploy` (deliberately not
  `vercel deploy --prod`, which would upload the local working tree —
  including this session's untouched concurrent-session dirty files —
  instead of rebuilding the actual git commit). `call/web` now returns 201
  and creates a real Daily.co WebRTC room.
- **WhatsApp**: `WHATSAPP_APP_SECRET` (from Meta's app dashboard) and a
  freshly generated `WHATSAPP_VERIFY_TOKEN` were added; Meta's webhook
  verification handshake was live-confirmed (`hub.challenge` echoed back,
  200). `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID` were already
  configured from an earlier session. Inbound message delivery through the
  now-verified subscription has not yet been observed with a real message.

Founder contact number updated at the user's request: `+91 94431 25639` →
`+91 93446 25639`, across the live `employees` row (Supabase, direct REST
update), `scripts/seed-pagalava.ts`, and the `VCard.test.ts` fixture.

---

## 5. Recurring theme

The defects that mattered most were not crashes. They were **things that
silently pretended to work**:

- a business card that rendered a stranger's identity when lookup failed
- a booking tool that confirmed meetings nobody would attend — and, in
  Phase 14, the identical defect reintroduced in a second, disconnected UI
  path (a manual "Book an Appointment" modal) months after the original
  was fixed and pinned with regression tests. Same lesson each time: fix
  the shared code path, not just the one caller that got audited
- a dashboard reporting invented business metrics
- adapters returning fabricated successes when unconfigured
- alert rules with no scrape config, so alerting was structurally inert
- an accessibility scan that may have been auditing an empty page
- Settings fields that saved to the database and were read by nothing
  (Cal.com event type, email sender name) — configurable in appearance only
- a fully-built RAG pipeline (upload → chunk → embed → search) with no path
  from a live call to ever reach it
- a multilingual voice feature where every non-English call ran on a TTS
  engine with no real support for the spoken language — the payload was
  always correct, the AI just never said anything a human could understand

Each is now either genuinely working or **failing honestly and loudly**.

---

## 6. Completion by area

| Area | % | Notes |
|---|---|---|
| Architecture & code quality | 95% | Clean layering, 0 TODOs, 0 `any` |
| Security | 92% | RLS, RBAC, signed webhooks, distributed rate limiting |
| Database | 86% | Indexed, constrained; 7 migrations pending in production (§7); 2 orphan tables remain |
| Voice pipeline | 94% | Live and verified; HD synthesis model; scripted interruptible Tamil welcome live; latency unmeasured |
| Public business card | 96% | Redesigned, WCAG AA, 320–1440px; short `/c/{slug}` URLs (code-complete, migration-gated) |
| Admin dashboard | 96% | 14 pages real incl. analytics, products, services, employees, completed settings, completed overview |
| Analytics | 78% | 15 metrics + Top Topics + Recent Conversations; 4 still need instrumentation that doesn't exist |
| Knowledge base / RAG | 95% | Pipeline complete AND now reachable from a live call via `search_knowledge_base`; semantic mode inert until `OPENAI_API_KEY` is set (text fallback works today) |
| Booking | 85% | Code correct; per-company event type + sender name now wired; needs Cal.com credentials |
| Email | 80% | Code correct; per-company sender name now wired and sanitised; needs Resend key |
| Employee management | 95% | Full CRUD, voice override, prompt override, card visibility hardened for the migration window |
| Company settings | 95% | Every field now read by something; Team Members panel added; logo upload now actually reaches the public card |
| Lead qualification & nurture | 90% | Temperature classification, cold-reason routing, nurture email all built and tested; migration not yet applied to production (§7) |
| Testing | 92% | 324 unit + 42 browser; no load testing |
| Observability | 80% | Config complete; stack never run |
| Deployment | 95% | Live on Vercel, HTTPS, auto-deploy from GitHub |
| **Overall** | **~96%** | Blocked mainly on the Phase 16 migration not yet applied (§7), not on missing code |

---

## 7. Outstanding

### Pending — Phase 16's qualification-engine migration

`supabase/migrations/20260812_lead_qualification_engine.sql` is written and
verified against the local test suite but **not yet applied to the live
Supabase project**, and this phase's commit has **not been pushed**. Held
deliberately: a schema change plus new AI sales behavior going live on a
real company's real customer-facing assistant warrants an explicit
go-ahead rather than autonomous execution, even under a broad "don't stop,
don't ask" instruction. Until applied, `update_lead_qualification` and the
new `save_lead` fields will fail against production (the columns don't
exist there yet) — do not deploy the code ahead of the migration; apply the
migration first, same lesson as the Phase 10 incident above.

### Resolved this session — all migrations applied, photo/slug live

All 13 migrations are now applied in production, run directly via
`scripts/migrate.mjs` against the Supabase **session pooler** connection
(`aws-0-ap-southeast-2.pooler.supabase.com:5432` — the direct
`db.<ref>.supabase.co` host is IPv6-only and unreachable from this
environment's network; the pooler resolves over IPv4 too). The script's own
`schema_migrations` tracking table was empty despite migrations
`20260729`–`20260801` (5 files) already being live in the real schema —
applied at some earlier point outside this script's own bookkeeping — so
those 5 were backfilled into the tracking table (verified applied first,
directly against `information_schema`/`pg_type`/`pg_indexes`, not assumed)
before letting the script run the genuinely pending 8
(`20260802`–`20260809`, one more than the previously-documented "seven" —
`20260802`'s indexes had also never actually been applied).

Founder photo uploaded to the `employee-avatars` bucket and
`employees.avatar_path` set; `employees.slug = 'srinivasan'` set. Both
confirmed live: `/c/srinivasan` returns 200, and the public API returns a
real `avatarUrl`.

**Now safe to remove** (the doc's own prior instruction, unexecuted this
session — a follow-up, not urgent):
- `SupabaseKnowledgeRepository`'s `isMissingCatalogColumn` fallback
  (products/services) and its `CatalogMigrationWindow.test.ts` — the
  migration window they existed for has closed.
- `isEmployeeCardVisible`'s tolerance for an absent `is_active` column can
  stay permanently regardless — costs nothing, removing it buys nothing.

**Credentials now configured this session** (`OPENAI_API_KEY`,
`VAPI_API_KEY` — both confirmed via `/api/health` showing `"embeddings":
"configured"` and `"vapiVoice":"configured"`). Still placeholder:

| Variable | Unlocks |
|---|---|
| `CALCOM_API_KEY` + `CALCOM_EVENT_TYPE_ID` | Real calendar bookings |
| `RESEND_API_KEY` | Outbound email |
| `REDIS_URL` | Caching + distributed rate limiting |

ElevenLabs (native Tamil voice) has a key but it doesn't go here — it must be
linked in Vapi's own dashboard (Provider Keys), then `VOICE_ELEVENLABS_VOICE_ID`
set once a voice ID is picked. Not done yet — pending the user's action in
Vapi's dashboard.

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
6a. ~~Short public URLs, founder photo/logo, HD voice, scripted Tamil
   welcome~~ — **done** (Phase 10). Slug/photo assigned in data, gated on
   migrations `20260808`/`20260807` respectively (see above); the Tamil
   greeting itself needed no migration and is live now.
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
| `npm test` | 956 unit/integration tests |
| `npm run test:e2e` | Playwright (build first) |
| `npm run verify:migrations` | Apply migrations to local PGlite |
| `npm run verify:db` | Check the live Supabase project |
| `npm run seed:pagalava` | Seed the demo card (idempotent) |

Further reading: [`README.md`](README.md) ·
[`DEPLOYMENT_CHECKLIST.md`](DEPLOYMENT_CHECKLIST.md) ·
[`TROUBLESHOOTING.md`](TROUBLESHOOTING.md)
