import { resolvePublicBaseUrl } from "@/shared/lib/publicUrl";

/** True when the env var holds a real-looking value rather than a
 * placeholder — the same test security.ts applies to webhook secrets. */
export function isConfiguredValue(v: string | undefined): boolean {
  return Boolean(v && !/your-|placeholder|example|xxxx/i.test(v));
}

export interface ProviderHealth {
  /** "ok" — this request's own DB queries succeeded. */
  database: string;
  vapi: string;
  whatsapp: string;
  whatsappTemplate: string;
  calendar: string;
  email: string;
  cron: string;
  tts: string;
  note: string;
}

/**
 * Configuration-truth provider health, shared by the dashboard overview and
 * the analytics page so the two never disagree. "Configured" means the
 * credential is present and non-placeholder — never a claim of provider
 * uptime. TTS optionally gets a LIVE probe through the real pitch-audio
 * path (analytics does this; the frequently-polled overview does not, so
 * polling can never render TTS or spend money).
 */
export async function buildProviderHealth(options: {
  probeTts?: { requestOrigin: string | null; companyId: string; employeeId: string | undefined };
}): Promise<ProviderHealth> {
  let ttsStatus = isConfiguredValue(process.env.OPENAI_API_KEY) ? "configured" : "not configured";

  const probe = options.probeTts;
  const probeBase = probe ? resolvePublicBaseUrl(probe.requestOrigin) : null;
  if (probe && probe.employeeId && probeBase && ttsStatus === "configured") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(`${probeBase}/api/public/${probe.companyId}/${probe.employeeId}/pitch?type=usp&lang=en`, {
        signal: controller.signal,
        cache: "no-store",
      });
      ttsStatus = res.ok ? "available" : res.status === 503 ? "unavailable (provider/billing)" : `error (http ${res.status})`;
    } catch {
      ttsStatus = "configured (probe timeout)";
    } finally {
      // In a finally so a non-abort throw (DNS, TLS) can't leave the timer
      // armed against a dead controller (2026-08-19 audit).
      clearTimeout(timer);
    }
  }

  return {
    database: "ok",
    vapi: isConfiguredValue(process.env.VAPI_API_KEY) ? "configured" : "not configured",
    whatsapp:
      isConfiguredValue(process.env.WHATSAPP_ACCESS_TOKEN) && isConfiguredValue(process.env.WHATSAPP_PHONE_NUMBER_ID)
        ? "configured"
        : "not configured",
    whatsappTemplate: isConfiguredValue(process.env.WHATSAPP_TEMPLATE_NAME) ? "configured" : "not configured",
    calendar:
      isConfiguredValue(process.env.CALCOM_API_KEY) && isConfiguredValue(process.env.CALCOM_EVENT_TYPE_ID) ? "configured" : "not configured",
    email: isConfiguredValue(process.env.RESEND_API_KEY) ? "configured" : "not configured",
    cron: isConfiguredValue(process.env.CRON_SECRET) ? "configured" : "not configured",
    tts: ttsStatus,
    note:
      "“Configured” reflects credential presence, never provider uptime. TTS is live-probed on the analytics page only; delivery outcomes below reflect actually recorded sends.",
  };
}
