import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/shared/lib/supabase";
import { isPlaceholderCredential } from "@/shared/lib/security";
import { isRedisConfigured, getRedisClient } from "@/core/infrastructure/cache/redisClient";
import { validateEnvironment } from "@/config/env.config";

/**
 * Real connectivity checks, not just "is the env var present" — the
 * original audit flagged this endpoint for reporting "healthy" purely
 * from Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL), which stays true
 * even for a dead or wrong Supabase project. This is what the
 * Kubernetes readiness/liveness probes in kubernetes/base/deployment.yaml
 * actually hit.
 */
async function checkDatabase(): Promise<{ status: string; latencyMs?: number; error?: string }> {
  if (isPlaceholderCredential(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
    return { status: "unconfigured" };
  }
  const start = Date.now();
  try {
    const { error } = await supabaseAdmin.from("companies").select("id").limit(1);
    if (error) return { status: "error", error: error.message };
    return { status: "connected", latencyMs: Date.now() - start };
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

async function checkRedis(): Promise<{ status: string; latencyMs?: number; error?: string }> {
  if (!isRedisConfigured()) return { status: "unconfigured" };
  const start = Date.now();
  try {
    await getRedisClient().ping();
    return { status: "connected", latencyMs: Date.now() - start };
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

// A health check that is cached is not a health check. This route only avoids
// static prerendering today as a side effect of its no-store Supabase fetch —
// declaring it explicitly means a future refactor of that query can't silently
// turn liveness reporting into a build-time snapshot. It also stops the build
// logging a "Dynamic server usage" exception on every static-render attempt.
export const dynamic = "force-dynamic";

export async function GET() {
  const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);

  const vapiVoice = isPlaceholderCredential(process.env.VAPI_API_KEY) ? "unconfigured" : "configured";
  const email = isPlaceholderCredential(process.env.RESEND_API_KEY) ? "unconfigured" : "configured";
  const calendar = isPlaceholderCredential(process.env.CALCOM_API_KEY) ? "unconfigured" : "configured";
  const embeddings = isPlaceholderCredential(process.env.OPENAI_API_KEY) ? "unconfigured" : "configured";

  // "healthy" requires the database to actually be reachable, not just
  // configured — an "error" status (wrong credentials, unreachable host)
  // is a real outage. Third-party services being "unconfigured" is
  // expected in non-production environments and doesn't fail the probe.
  const status = database.status === "connected" ? "healthy" : database.status === "error" ? "unhealthy" : "degraded";

  return NextResponse.json(
    {
      status,
      version: "1.0.0",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      services: {
        database,
        redis,
        vapiVoice,
        email,
        calendar,
        embeddings,
      },
      // Surfaced so a misconfiguration is diagnosable from outside the box.
      // Reported rather than thrown at startup: crashing on an unconfigured
      // optional integration would turn a degraded feature into an outage,
      // and every one of them already degrades honestly on its own.
      configuration: validateEnvironment(),
    },
    { status: status === "healthy" ? 200 : status === "unhealthy" ? 503 : 200 }
  );
}
