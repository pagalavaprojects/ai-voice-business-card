# Enterprise Code Quality & Refactoring Guidelines

## 1. Core Principles
- **Clean Architecture & DDD**: All domain logic lives in `src/core/domain/` and `src/core/application/`.
- **Single Responsibility Principle**: Split React components over 300 lines, services over 300 lines, and hooks over 200 lines.
- **Strict Typing**: No `any` types. All domain models, DTOs, and tools must have strong TypeScript interfaces and Zod validation schemas.
- **Path Aliases**: All imports use clean `@/*` path mapping (`@/core/domain/...`, `@/shared/ui/...`).
