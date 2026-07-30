# Vapi Integration Specification

## 1. WebRTC Client Hook (`useVapiSession`)
- Instantiates `@vapi-ai/web` with public key.
- Listens to `call-start`, `call-end`, `speech-start`, `speech-end`, `transcript`, and `error`.
- Dynamically configures backend webhook URL:
  `GET /api/vapi/webhook?companyId={id}&employeeId={id}`

## 2. Server Message Contract
Vapi sends webhook requests to our Next.js backend for:
- `assistant-request`: Requests system prompt & tool definitions.
- `tool-calls`: Directs execution of registered function calls (`save_lead`, `book_appointment`, etc.).
- `end-of-call-report`: Delivers final transcript & summary.
