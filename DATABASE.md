# Database Architecture & Schema Specification

## Schema Design
The platform uses PostgreSQL (via Supabase) with normalized multi-tenant tables.

## Primary Entities & Tables
- `companies`: Multi-tenant company definitions.
- `employees`: Digital twin profiles linked to companies.
- `products`: Product catalog with GIN full-text search indexes (`fts`).
- `services`: Service catalog with pricing and deliverables.
- `faqs`: Frequently asked questions with full-text search.
- `leads`: Lead contact records with lead score categories (`HIGH`, `MEDIUM`, `LOW`).
- `conversations` & `conversation_messages`: Speech interaction history and transcripts.
- `appointments`: Booking records linked to leads and employees.
- `prompt_templates`: Module-based prompt overrides (`identity`, `sales`, `knowledge`).

## Security & Isolation
- Row Level Security (RLS) policies enabled across all tenant tables.
- Foreign keys set to `ON DELETE CASCADE` or `ON DELETE SET NULL` for data integrity.
