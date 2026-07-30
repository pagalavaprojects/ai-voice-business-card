# Compliance Readiness Specification (SOC 2, ISO 27001, GDPR, HIPAA)

- **SOC 2 Type II**: Audit logging, access control (RBAC), database encryption at rest (AES-256) and in transit (TLS 1.3).
- **GDPR / CCPA**: Right-to-be-forgotten soft-delete cascade scripts (`deleted_at`), cookie consent, and data export endpoints.
- **HIPAA Compliance**: BAA support via Supabase Healthcare plan & encrypted storage buckets.
