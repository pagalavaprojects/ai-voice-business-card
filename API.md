# API Architecture & Endpoints Documentation

## Endpoints Summary

### 1. Vapi Webhook Endpoint
- **URL**: `POST /api/vapi/webhook?companyId={id}&employeeId={id}`
- **Purpose**: Voice orchestration bridge for Vapi assistant requests and function call tools.
- **Header Security**: `x-vapi-secret` signature check.
- **Request Types**:
  - `assistant-request`: Returns dynamically assembled system prompt and available tools.
  - `tool-calls`: Executes `save_lead`, `book_appointment`, or `search_faqs`.
  - `end-of-call-report`: Processes final call summary and metadata.

### 2. Admin Leads Endpoint
- **URL**: `GET /api/admin/leads?companyId={id}&status=QUALIFIED&limit=20`
- **Purpose**: Paginated list of leads for Admin Dashboard.
- **Response Format**: Standardized JSON wrapper:
```json
{
  "status": 200,
  "success": true,
  "message": "Leads retrieved successfully",
  "data": [...],
  "errors": [],
  "timestamp": "2026-07-29T17:00:00.000Z"
}
```
