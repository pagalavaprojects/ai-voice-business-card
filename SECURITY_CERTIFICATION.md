# Enterprise Security Certification

## Security Controls Assessment:
- **Authentication**: `@supabase/ssr` middleware validating JWT session cookies.
- **Authorization**: Granular Role-Based Access Control (`rbac.ts`).
- **Data Isolation**: PostgreSQL Row Level Security (RLS) policies on all tables.
- **Webhook Integrity**: HMAC signature validation (`x-vapi-secret`).
- **Data Input Sanitization**: Strict Zod schema parsing.
- **HTTP Security Headers**: HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy.
