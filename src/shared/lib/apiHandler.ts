import { ZodError } from "zod";
import { AuthError, RateLimitError } from "@/shared/lib/tenant";
import { formatApiResponse } from "@/shared/lib/security";

/** Single place every API route converts a thrown error into a consistent
 * { status, success, message, data, errors } response shape (§ API layer
 * consistency). AuthError -> 401/403, ZodError -> 422 with field-level
 * messages, anything else -> 500 without leaking internals beyond the
 * error message already used throughout the existing repositories. */
export function handleApiError(error: unknown) {
  if (error instanceof AuthError) {
    return formatApiResponse(null, error.status, error.message);
  }
  // 429 carries Retry-After so clients back off on the documented signal
  // instead of retrying immediately as they would against a 403.
  if (error instanceof RateLimitError) {
    const response = formatApiResponse(null, 429, error.message, ["Rate limit exceeded"]);
    response.headers.set("Retry-After", String(error.retryAfterSeconds));
    return response;
  }
  if (error instanceof ZodError) {
    return formatApiResponse(
      null,
      422,
      "Validation failed",
      error.issues.map((issue) => `${issue.path.join(".") || "value"}: ${issue.message}`)
    );
  }
  const message = error instanceof Error ? error.message : "Internal server error";
  return formatApiResponse(null, 500, "Internal server error", [message]);
}
