# Tool Registry System Architecture

The `ToolRegistry` isolates Vapi tool definitions from execution logic. Every tool implements:
- `name`: String identifier matched against LLM function calls.
- `description`: Instructions for the LLM explaining when to call the tool.
- `parameters`: JSON Schema specifying argument types and required fields.
- `execute`: Asynchronous handler with access to `ToolContext` (`companyId`, `employeeId`, `conversationId`).
