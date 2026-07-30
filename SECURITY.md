# Security Architecture & OWASP Compliance

## Implemented Security Controls

1. **Webhook Authentication**:
   - Vapi Webhook requests validate the `x-vapi-secret` header against `VAPI_WEBHOOK_SECRET`.

2. **Data Isolation (Multi-Tenancy)**:
   - Supabase Row-Level Security (RLS) policies enforce company boundary checks on `company_id`.

3. **Input Validation & Sanitization**:
   - Strict Zod schemas (`CreateLeadSchema`, `CreateAppointmentSchema`, `CreateProductSchema`, `CreateFAQSchema`) parse and validate all incoming payload data before persistence.

4. **Prompt Injection Mitigation**:
   - Dynamic prompt generation includes strict boundary delimiters (`=== DIGITAL TWIN IDENTITY ===`) and explicit behavioral rules prohibiting unauthorized instructions.

5. **SQL Injection Protection**:
   - PostgreSQL queries are executed via Supabase ORM parameterized queries with full-text search parameters safely escaped.
