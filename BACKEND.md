# Backend Engine Specification

## Overview
The backend engine provides dynamic prompt assembly, voice tool executions, lead scoring, and appointment scheduling.

## Core Components
- **PromptAssemblyService**: Dynamically combines company knowledge, employee metadata, and FAQs into unified prompt contexts for GPT-4o-mini via Vapi.
- **LeadQualificationService**: Scores incoming leads based on budget, urgency, and identified pain points.
- **ToolRegistry**: Manages function calls (`save_lead`, `book_appointment`, `search_faqs`) executed during live voice conversations.
- **ConversationEngine**: Manages state transitions across `Greeting`, `Discovery`, `Qualification`, `Recommendation`, `Booking`, and `EndCall`.
