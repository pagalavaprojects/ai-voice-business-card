# Production Gap Analysis

This document details all technical gaps between the current codebase state and a live production multi-tenant deployment.

## Gap 1: External Cal.com REST API Authorization
- **Current State**: `ToolRegistry` (`book_appointment`) inserts appointment records into PostgreSQL database via `SupabaseBookingRepository`.
- **Production Requirement**: Perform an outbound HTTP request to Cal.com REST API (`https://api.cal.com/v1/bookings?apiKey=...`) to block the employee's Google/Outlook calendar.
- **Gap Resolution**: Implement `CalcomBookingAdapter` implementing `IBookingAdapter`.

## Gap 2: Production Auth & JWT Session Verification
- **Current State**: API endpoints validate company IDs via request context and headers.
- **Production Requirement**: Protect `/(admin)/dashboard` routes with Next.js `middleware.ts` validating Supabase Auth JWT tokens.
- **Gap Resolution**: Add `@supabase/ssr` middleware in `src/middleware.ts`.

## Gap 3: Redis Cache for High-Concurrency Prompt Generation
- **Current State**: Every Vapi assistant prompt request executes 5 SELECT queries against Supabase.
- **Production Requirement**: Cache assembled company profiles and product catalogs in Upstash Redis with a 5-minute TTL.
- **Gap Resolution**: Implement `RedisCachedKnowledgeProvider` wrapping `SupabaseKnowledgeRepository`.

## Gap 4: E2E Integration Test Automation
- **Current State**: 4 Jest unit test suites pass (7 tests).
- **Production Requirement**: Automated Playwright / Cypress WebRTC end-to-end tests.
- **Gap Resolution**: Add Playwright test scenarios in Phase 10.
