# Supabase Auth & Session Middleware Specification

## Implementation Summary
- Next.js SSR middleware in `src/middleware.ts` handles cookie session refresh using `@supabase/ssr`.
- Protected route rules restrict `/(admin)/dashboard/*` and `/api/admin/*` to authenticated users.
