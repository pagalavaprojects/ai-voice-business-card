# CRM Adapters & Storage Architecture

Supabase PostgreSQL is the primary CRM database (`leads`, `conversations`, `appointments`). `ICRMAdapter` abstracts storage so future external CRM connectors (Google Sheets, HubSpot, Salesforce) can subscribe to `LeadCreated` system events without modifying domain logic.
