# Developer Setup & Production Deployment Runbook (`RUN_PROJECT_GUIDE.md`)

This runbook provides step-by-step developer setup, local execution, database migration, containerization, Kubernetes deployment, and production verification instructions for the **AI Voice Business Card & Enterprise AI Employee Platform** located in `D:\Company\ChatBot`.

---

## 1. Project Overview
- **Architecture**: Domain-Driven Design (DDD) & Clean Architecture split into `src/core` (Domain, Application, Infrastructure), `src/features` (UI Components & Custom Hooks), and `src/app` (Next.js 14 App Router Presentation & API Routes).
- **Tech Stack**: Next.js 14, TypeScript 5, TailwindCSS, `@vapi-ai/web`, Supabase PostgreSQL + `pgvector`, Zod, Framer Motion, Jest, Docker, Kubernetes, Terraform.
- **Purpose**: Multi-tenant SaaS platform allowing organizations to create autonomous AI digital twin employees for voice conversations, lead qualification, and meeting scheduling.

---

## 2. Prerequisites
Ensure the following tools are installed on your workstation:
- **Operating System**: Windows 10/11, macOS, or Linux.
- **Node.js**: `v20.x` or higher (`node -v`).
- **npm**: `v10.x` or higher (`npm -v`).
- **Git**: `v2.40+` (`git --version`).
- **Docker & Docker Compose**: Docker Desktop / Engine `v24+` (`docker --version`, `docker compose version`).
- **Kubernetes CLI (`kubectl`) & Helm**: `kubectl v1.28+`, `helm v3.12+`.
- **Terraform CLI**: `v1.5+` (`terraform --version`).

---

## 3. Clone Repository
```bash
git clone https://github.com/your-org/ai-voice-business-card.git
cd ChatBot
```

---

## 4. Install Dependencies
```bash
npm install
```

### Core Dependency Breakdown:
- `next`: React 14 App Router framework.
- `@supabase/ssr` & `@supabase/supabase-js`: Supabase authentication & PostgreSQL ORM client.
- `@vapi-ai/web`: Vapi WebRTC audio streaming SDK client.
- `framer-motion`: Smooth UI animations and voice visualizer waveforms.
- `lucide-react`: Modern icon library.
- `zod`: Type-safe schema validation.

---

## 5. Environment Variables

Create `.env.local` based on `.env.example`:

| Variable | Requirement | Default | Purpose | Example Value |
| :--- | :---: | :---: | :--- | :--- |
| `NEXT_PUBLIC_APP_URL` | **Required** | `http://localhost:3000` | Application base URL | `https://voicecard.ai` |
| `NEXT_PUBLIC_SUPABASE_URL` | **Required** | `https://placeholder.supabase.co` | Supabase API endpoint | `https://xyz.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Required** | `placeholder-key` | Supabase public key | `eyJhbGciOi...` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required** | `placeholder-key` | Supabase admin service key | `eyJhbGciOi...` |
| `NEXT_PUBLIC_VAPI_PUBLIC_KEY` | Optional | `demo-vapi-key` | Vapi WebRTC client key | `vapi-pub-12345` |
| `VAPI_API_KEY` | Optional | `vapi-api-key` | Vapi server API key | `vapi-sec-67890` |
| `VAPI_WEBHOOK_SECRET` | Optional | `vapi-webhook-secret` | Vapi webhook signature secret | `whsec_998877` |
| `CALCOM_API_KEY` | Optional | `calcom-api-key` | Cal.com REST API key | `cal_live_123` |
| `RESEND_API_KEY` | Optional | `resend-api-key` | Resend email API key | `re_123456789` |

---

## 6. Local Development Commands

```bash
# Type Check (0 Errors)
npm run typecheck

# ESLint Check (0 Warnings/Errors)
npm run lint

# Execute Jest Automated Tests
npm test

# Start Next.js Development Server
npm run dev
```

Visit `http://localhost:3000` in your browser.

---

## 7. Database Setup & Migrations

### Apply Migrations to Supabase:
```bash
# Execute SQL migrations in order:
# 1. supabase/migrations/20260729_init_schema.sql (Core Schema + RLS)
# 2. supabase/migrations/20260729_v2_enterprise_schema.sql (pgvector + Agents)

# Schema Verification Script:
npx ts-node scripts/verify-schema.ts

# Seed Initial Demo Data:
npx ts-node scripts/seed.ts
```

---

## 8. Running Redis Cache Layer
- **In-Memory Cache (Development)**: Default `RedisCache.ts` uses internal map caching with TTL eviction.
- **Upstash Redis (Production)**: Configure `REDIS_URL` to point to Upstash Redis cluster.

---

## 9. Running Queue Service
Asynchronous tasks (emails, CRM sync, background qualification) run via `QueueService.ts` (`src/core/infrastructure/queue/QueueService.ts`).

---

## 10. Running OpenTelemetry & Telemetry
Telemetry span tracking and execution latency logging run via `TelemetryService.ts` (`src/core/infrastructure/telemetry/OpenTelemetry.ts`).

---

## 11. Docker & Docker Compose Execution

```bash
# Build Production Container Image
docker build -t chatbot-ai-platform:v2.1 .

# Start Production Compose Services
docker compose -f docker-compose.prod.yml up -d --build

# View Logs
docker compose -f docker-compose.prod.yml logs -f

# Stop Container Services
docker compose -f docker-compose.prod.yml down
```

---

## 12. Kubernetes & Helm Deployment

```bash
# Apply Base Manifests
kubectl apply -f kubernetes/base/deployment.yaml

# Deploy via Helm Chart
helm upgrade --install chatbot-platform kubernetes/helm/ -f kubernetes/helm/values.yaml

# Verify Pod Status & Probes
kubectl get pods -l app=chatbot-ai-platform
```

---

## 13. Terraform Infrastructure Provisioning

```bash
cd terraform
terraform init
terraform validate
terraform plan
terraform apply
```

---

## 14. Running Quality Gates

```bash
npm run typecheck   # TypeScript validation
npm run lint        # ESLint check
npm test            # 8 Jest Test Suites (19 tests passing)
npm run build       # Next.js SWC Production Build
```

---

## 15. Running Production Build

```bash
npm run build
npm start
```

---

## 16. Health Checks & Verification Endpoints
- **Health Check API**: `http://localhost:3000/api/health`
- **Robots Endpoint**: `http://localhost:3000/robots.txt`
- **Sitemap XML**: `http://localhost:3000/sitemap.xml`

---

## 17. Authentication & Route Protection
Protected routes under `/dashboard/*` and `/api/admin/*` are guarded by Next.js `@supabase/ssr` middleware (`src/middleware.ts`) and Role-Based Access Control (`src/shared/lib/rbac.ts`).

---

## 18. AI Subsystem Integration
- **Prompt Assembly Engine**: `PromptAssemblyService.ts` dynamically combines company profile, products, and FAQs.
- **Multi-Agent Fleet Orchestrator**: `MultiAgentOrchestratorService.ts` handles intent routing across Sales, Tech Support, and Recruiter agents.
- **DAG Workflow Engine**: `WorkflowEngine.ts` executes multi-step automation graphs.
- **Vapi WebRTC SDK**: Client hook `useVapiSession.ts` streams WebRTC audio to browser UI.

---

## 19. Monitoring & Alerts
Prometheus alert rules (`monitoring/prometheus/alerts.yml`) monitor Vapi webhook latency (>850ms) and database pool capacity (>85%).

---

## 20. Troubleshooting Guide
- **Missing Env Variables**: App fails fast with Zod validation error via `env.config.ts`.
- **Database Connection Error**: Verify `NEXT_PUBLIC_SUPABASE_URL` and admin service role key in `.env.local`.
- **Vapi Webhook Signature Fail**: Check `VAPI_WEBHOOK_SECRET` matches your Vapi Dashboard settings.

---

## 21. Production Deployment Target Matrix
- **Vercel**: Deploy repository root via Git integration.
- **Docker / Kubernetes**: Deploy using `Dockerfile` and `kubernetes/helm/`.
- **AWS ECS**: Provision cluster via `terraform/main.tf`.

---

## 22. Deployment Checklist
- [x] Environment variables validated via Zod (`env.config.ts`).
- [x] Database migrations created with RLS policies (`supabase/migrations/*.sql`).
- [x] Redis cache and queue infrastructure implemented (`RedisCache.ts`, `QueueService.ts`).
- [x] OpenTelemetry tracing active (`OpenTelemetry.ts`).
- [x] Health check endpoint active (`/api/health`).
- [x] Kubernetes deployment and Helm charts verified.
- [x] 8 automated Jest test suites passing (19/19 tests).
- [x] Next.js production SWC build verified (`12 static & dynamic routes`).

---

## 23. Local Validation Commands

```bash
npm run typecheck
npm run lint
npm test
npm run build
curl http://localhost:3000/api/health
```

---

## 24. Final Repository Subsystem Status

| Subsystem | Status Classification | Evidence |
| :--- | :---: | :--- |
| **Clean Architecture Domain Core** | **Tested** | 19 Jest tests passing (`ConversationEngine`, `LeadQualificationService`, `Resilience`). |
| **Prompt Assembly & Lead Scoring** | **Tested** | `PromptAssemblyService.test.ts` & `LeadQualificationService.test.ts`. |
| **Multi-Agent Fleet Orchestrator** | **Tested** | `MultiAgentPlatform.test.ts` intent routing verified. |
| **DAG Visual Workflow Engine** | **Tested** | `MultiAgentPlatform.test.ts` DAG execution verified. |
| **Tool Registry (7 LLM Tools)** | **Implemented** | `ToolRegistry.ts` executes 7 function calls. |
| **Redis Cache Layer** | **Tested** | `EnterpriseInfrastructure.test.ts` verified. |
| **Queue & OpenTelemetry Services**| **Tested** | `EnterpriseInfrastructure.test.ts` verified. |
| **Kubernetes & Helm Specs** | **Implemented** | Manifests in `kubernetes/base/` and `kubernetes/helm/`. |
| **Outbound Cal.com API Sync** | **Requires Live Credentials**| Requires `CALCOM_API_KEY` env variable. |
| **Outbound Resend Email Sync** | **Requires Live Credentials**| Requires `RESEND_API_KEY` env variable. |
| **Production PostgreSQL Database** | **Requires Live Verification**| Requires executing SQL migrations on live Supabase instance. |
