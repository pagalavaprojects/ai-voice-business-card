# Cal.com Outbound REST Integration Specification

`CalcomAdapter` connects the LLM `book_appointment` function call to Cal.com REST API (`https://api.cal.com/v1/bookings`).

## Execution Flow:
1. Visitor selects or agrees to appointment time in Vapi voice session.
2. `ToolRegistry` calls `book_appointment`.
3. `CalcomAdapter.createBooking` posts payload with visitor name, email, timeZone, and eventTypeId.
4. Returns meeting URL & booking UID to store in Supabase `appointments` table.
