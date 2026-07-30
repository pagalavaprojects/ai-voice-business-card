# System Architecture & Design Specification

## Overview
The AI Voice Business Card SaaS platform is built on Clean Architecture and Domain-Driven Design (DDD) principles. The system decouples presentation (Next.js App Router) from business domain logic (`src/core`).

```
+-------------------------------------------------------------+
|               Presentation & API Layer                      |
|          (Next.js App Router & API Route Handlers)          |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|                     Application Layer                       |
| (PromptAssemblyService, LeadQualificationService, Tools)     |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|                       Domain Layer                          |
| (Entities, ConversationEngine, EventBus, Repository Interfaces)|
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|                    Infrastructure Layer                     |
|  (Supabase Adapters, Cal.com Adapters, Vapi Webhooks)       |
+-------------------------------------------------------------+
```

## Key Architectural Highlights
1. **Framework Independence**: All business logic resides in `src/core` and relies strictly on TypeScript interfaces (`ICRMRepository`, `IKnowledgeRepository`, etc.).
2. **Unified Core Engine**: Handles prompt generation, tool executions, and state tracking seamlessly without vendor lock-in.
3. **Decoupled Event System**: In-memory event bus that can be swapped with Redis or Kafka without refactoring domain services.
