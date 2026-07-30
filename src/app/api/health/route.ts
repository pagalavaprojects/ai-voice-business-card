import { NextResponse } from "next/server";

export async function GET() {
  const isSupabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const isVapiConfigured = Boolean(process.env.VAPI_API_KEY);

  const status = isSupabaseConfigured ? "healthy" : "degraded";

  return NextResponse.json(
    {
      status,
      version: "1.0.0",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      services: {
        database: isSupabaseConfigured ? "connected" : "unconfigured",
        vapiVoice: isVapiConfigured ? "ready" : "unconfigured",
      },
    },
    { status: status === "healthy" ? 200 : 503 }
  );
}
