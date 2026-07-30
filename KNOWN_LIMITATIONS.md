# Production Limitations & Verification Status Register

This document provides a transparent breakdown of feature verification levels.

## Verification Classifications:
1. **Implemented & Unit Tested**: Code exists, compiled cleanly, and passed automated Jest tests in the codebase.
2. **Integration Tested**: Tested against multi-module backend workflows (e.g. prompt assembly -> lead scoring -> tool execution).
3. **Pending Production Validation**: Code is written and functional, but requires live external SaaS credentials (`CALCOM_API_KEY`, `RESEND_API_KEY`, live `VAPI_API_KEY`) in the production environment.

## Feature Matrix:

| Feature | Verification Level | Live Production Validation Requirements |
| :--- | :---: | :--- |
| **Domain Layer & Business Models** | **Unit & Integration Tested** | None. Pure code logic. |
| **Supabase Repositories & SQL Schema** | **Integration Tested** | Requires deployment to live Supabase DB instance. |
| **Dynamic Prompt Assembly Engine** | **Integration Tested** | Validated locally; requires live OpenAI / Vapi API key. |
| **Lead Qualification & Scoring** | **Unit & Integration Tested** | None. Rule engine fully functional. |
| **Vapi WebRTC SDK Hook** | **Unit & Integration Tested** | Requires active Vapi Account & Public Agent Key. |
| **Outbound Cal.com API Adapter** | **Unit Tested (Fallback Mode)**| Requires active Cal.com Account & API Key. |
| **Outbound Resend Email Adapter** | **Unit Tested (Simulated Mode)**| Requires active Resend Account & API Key. |
