import { isPlaceholderCredential } from "@/shared/lib/security";

/**
 * Environment validation that actually validates.
 *
 * The previous version defaulted every variable to a placeholder, so
 * `envSchema.parse()` could never fail — and nothing imported it anyway. It
 * was a safety net that was neither hung nor able to catch anything.
 *
 * This reports problems rather than throwing at import time. Crashing the
 * process on a misconfigured optional integration would turn a degraded
 * feature into a total outage, and the app is deliberately built to degrade
 * honestly instead. Surfaced through /api/health so misconfiguration is
 * visible from outside the box.
 */

export interface EnvIssue {
  variable: string;
  severity: "error" | "warning";
  message: string;
}

/** Required for the application to function at all. */
const REQUIRED = [
  { key: "NEXT_PUBLIC_SUPABASE_URL", why: "no database connection is possible" },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", why: "browser auth cannot initialise" },
  { key: "SUPABASE_SERVICE_ROLE_KEY", why: "server-side data access will fail" },
] as const;

/** Each disables one capability; the app still runs without them. */
const OPTIONAL = [
  { key: "NEXT_PUBLIC_VAPI_PUBLIC_KEY", disables: "live voice calls — the widget stays in silent demo mode" },
  { key: "PUBLIC_BASE_URL", disables: "voice tools (save_lead, book_appointment) — Vapi cannot reach a localhost callback" },
  { key: "VAPI_WEBHOOK_SECRET", disables: "webhook authentication" },
  { key: "CALCOM_API_KEY", disables: "real calendar bookings — appointments are captured as REQUESTED only" },
  { key: "CALCOM_EVENT_TYPE_ID", disables: "real calendar bookings — no event type to book against" },
  { key: "OPENAI_API_KEY", disables: "embeddings — knowledge search falls back to text matching" },
  { key: "RESEND_API_KEY", disables: "outbound email — sends are recorded as FAILED" },
  { key: "REDIS_URL", disables: "caching and distributed rate limiting" },
] as const;

export function validateEnvironment(): EnvIssue[] {
  const issues: EnvIssue[] = [];

  for (const { key, why } of REQUIRED) {
    if (isPlaceholderCredential(process.env[key])) {
      issues.push({ variable: key, severity: "error", message: `Missing or placeholder — ${why}.` });
    }
  }

  for (const { key, disables } of OPTIONAL) {
    if (isPlaceholderCredential(process.env[key])) {
      issues.push({ variable: key, severity: "warning", message: `Not configured — disables ${disables}.` });
    }
  }

  // CALCOM_EVENT_TYPE_ID is numeric; a non-numeric value silently prevents
  // booking in a way that looks identical to it being absent.
  const eventTypeId = process.env.CALCOM_EVENT_TYPE_ID;
  if (eventTypeId && !isPlaceholderCredential(eventTypeId) && !Number.isFinite(Number(eventTypeId))) {
    issues.push({ variable: "CALCOM_EVENT_TYPE_ID", severity: "error", message: "Must be numeric." });
  }

  return issues;
}

/** True when nothing required is missing. Optional warnings don't block. */
export function isEnvironmentUsable(): boolean {
  return validateEnvironment().every((i) => i.severity !== "error");
}
