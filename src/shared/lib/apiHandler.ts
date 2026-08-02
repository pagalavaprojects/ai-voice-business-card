import { randomUUID } from "crypto";
import { ZodError } from "zod";
import { AuthError, RateLimitError } from "@/shared/lib/tenant";
import { formatApiResponse } from "@/shared/lib/security";
import { Logger } from "@/shared/lib/logger";

/** Single place every API route converts a thrown error into a consistent
 * { status, success, message, data, errors } response shape.
 * AuthError -> 401/403, RateLimitError -> 429 with Retry-After,
 * ZodError -> 422 with field-level messages, anything else -> 500. */
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
  // Validation messages are safe and actively useful to the caller: they
  // describe the caller's own payload, not our internals.
  if (error instanceof ZodError) {
    return formatApiResponse(
      null,
      422,
      "Validation failed",
      error.issues.map((issue) => `${issue.path.join(".") || "value"}: ${issue.message}`)
    );
  }

  // Unexpected failures get a correlation id: the full detail goes to the
  // logs, and the client receives only the id.
  //
  // This previously returned the raw error message, which leaked internals —
  // a Postgres failure surfaced to the browser verbatim as
  // "invalid input syntax for type integer: 19.488", exposing column types
  // and query shape. The id keeps a support conversation actionable ("give me
  // the reference") without telling an attacker how the inside is built.
  const errorId = randomUUID();
  Logger.error("Unhandled API error", {
    errorId,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  return formatApiResponse(null, 500, "Something went wrong on our end. Please try again.", [`Reference: ${errorId}`]);
}
