# Conversation Engine & State Machine Specification

## State Transition Rules:
- `Greeting` ──(User asks about products/services)──► `Discovery` / `Recommendation`
- `Discovery` ──(System asks budget/urgency)──► `Qualification`
- `Qualification` ──(Lead score calculated)──► `Recommendation` / `Booking`
- `Booking` ──(Appointment confirmed)──► `Confirmation` ──► `EndCall`

The `ConversationEngine` tracks state transitions and ensures the assistant does not repeat questions or attempt to book before lead details are collected.
