# Platform Module Map

```
src/
├── app/                        # Next.js 14 Presentation Routes & API Handlers
│   ├── (public)/               # Public Voice Business Card UI
│   ├── (admin)/                # Admin SaaS Dashboard & Fleet Management
│   └── api/                    # Vapi Webhook, Admin APIs, Health Checks
├── core/                       # Framework-Independent Domain Core
│   ├── domain/                 # Models, Entities, Interfaces, Engines
│   ├── application/            # Prompt Assembly, Lead Scoring, Tool Registry, Orchestrator
│   └── infrastructure/         # Supabase, Cal.com, Resend Repositories
├── features/                   # Feature UI Modules & Hooks
│   ├── voice/                  # WebRTC Voice Hook & Visualizers
│   ├── dashboard/              # Sidebar & Admin Layouts
│   ├── leads/                  # Qualified Lead Tables & CSV Export
│   └── agents/                 # AI Agent Fleet Management
├── shared/                     # Design System Tokens & Atomic Components
└── config/                     # Environment Variable Validation (Zod)
```
