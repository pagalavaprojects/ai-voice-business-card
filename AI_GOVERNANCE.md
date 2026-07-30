# Enterprise AI Governance & Safety Manual

## Safety & Governance Policies:
- **Prompt Versioning**: Dynamic prompt assembly (`PromptAssemblyService.ts`) supports immutable template versions.
- **PII Detection & Masking**: Automatic masking of SSNs, Credit Cards, and Email addresses before LLM invocation.
- **System Prompt Boundaries**: Strict Markdown system boundaries (`=== DIGITAL TWIN IDENTITY ===`) prevent prompt injection attacks.
- **Audit Logging**: Every LLM tool call (`save_lead`, `book_appointment`, `search_products`) logs full parameter schemas and timestamps.
