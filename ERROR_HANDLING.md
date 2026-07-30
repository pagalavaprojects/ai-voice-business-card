# Standardized Error Handling Architecture

All error responses extend `ApplicationError` (`src/core/shared/errors/ApplicationError.ts`):
- `ValidationError`: 400 Bad Request
- `AuthenticationError`: 401 Unauthorized
- `AuthorizationError`: 403 Forbidden
- `NotFoundError`: 404 Not Found
- `InfrastructureError`: 502 Bad Gateway

All API endpoints wrap handlers with formatted JSON responses (`formatApiResponse`).
