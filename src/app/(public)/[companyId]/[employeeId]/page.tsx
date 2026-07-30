"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useVapiSession } from "@/features/voice/hooks/useVapiSession";
import { BusinessCardHeader } from "@/features/voice/components/BusinessCardHeader";
import { VoiceMicButton } from "@/features/voice/components/VoiceMicButton";
import { TranscriptViewer } from "@/features/voice/components/TranscriptViewer";
import { CallControls } from "@/features/voice/components/CallControls";
import { Card } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { useToast } from "@/shared/ui/toast";

// Demo employee data – replaced with real DB fetch when Supabase is configured
const DEMO_EMPLOYEE = {
  name: "Sarah Connor",
  designation: "VP of AI Solutions",
  companyName: "Acme Autonomous Corp",
  email: "sarah@acme.ai",
  phone: "+1 (555) 019-2831",
  website: "https://acme.ai",
  office: "San Francisco, CA",
  workingHours: "9 AM – 5 PM PST",
};

function formatTimer(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export default function VoiceBusinessCardPage() {
  const params = useParams();
  const companyId = (params?.companyId as string) || "demo-company";
  const employeeId = (params?.employeeId as string) || "demo-employee";
  const { showToast } = useToast();

  const {
    voiceState,
    isMuted,
    messages,
    durationSeconds,
    error,
    startCall,
    endCall,
    toggleMute,
  } = useVapiSession({ companyId, employeeId });

  const handleBookCall = () => {
    const calUrl = process.env.NEXT_PUBLIC_CAL_BOOKING_URL || "https://cal.com/demo/30min";
    window.open(calUrl, "_blank", "noopener,noreferrer");
    showToast("Opening calendar booking page…", "info");
  };

  return (
    <main className="min-h-screen bg-[#090d16] text-slate-100 flex items-center justify-center p-4 sm:p-6">
      {/* Glow Ambient Backdrop Effect */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-sky-500/10 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 w-full max-w-md space-y-6">
        {/* Main Card Container */}
        <Card className="glass-panel border-white/[0.08] shadow-2xl p-6 sm:p-8 rounded-3xl space-y-6">
          {/* Employee Header */}
          <BusinessCardHeader
            name={DEMO_EMPLOYEE.name}
            designation={DEMO_EMPLOYEE.designation}
            companyName={DEMO_EMPLOYEE.companyName}
            email={DEMO_EMPLOYEE.email}
            phone={DEMO_EMPLOYEE.phone}
            website={DEMO_EMPLOYEE.website}
            office={DEMO_EMPLOYEE.office}
            workingHours={DEMO_EMPLOYEE.workingHours}
          />

          {/* Error Alert */}
          {error && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs text-center"
            >
              {error}
            </div>
          )}

          {/* Voice Interaction Core */}
          <div className="flex flex-col items-center justify-center pt-2">
            <div className="flex items-center gap-2 mb-2">
              <Badge
                variant={voiceState === "idle" ? "outline" : voiceState === "speaking" ? "success" : "default"}
                aria-live="polite"
                aria-atomic="true"
              >
                {voiceState === "idle"
                  ? "Tap to Talk"
                  : voiceState === "connecting"
                  ? "Connecting WebRTC…"
                  : voiceState === "listening"
                  ? "Listening…"
                  : voiceState === "speaking"
                  ? "AI Twin Speaking"
                  : "Thinking…"}
              </Badge>
              {durationSeconds > 0 && (
                <span className="text-xs font-mono text-slate-400 font-semibold" aria-label={`Call duration ${formatTimer(durationSeconds)}`}>
                  {formatTimer(durationSeconds)}
                </span>
              )}
            </div>

            <VoiceMicButton
              state={voiceState}
              isMuted={isMuted}
              onClick={voiceState === "idle" ? startCall : endCall}
            />

            <p className="text-xs text-slate-400 text-center font-medium mt-2">
              {voiceState === "idle"
                ? `Press the microphone to start a live voice session with ${DEMO_EMPLOYEE.name.split(" ")[0]}'s AI Twin`
                : "Speak directly into your microphone. Response streamed in real-time."}
            </p>
          </div>

          {/* Live Streaming Transcript */}
          <TranscriptViewer messages={messages} />

          {/* Action Controls */}
          <CallControls
            isActive={voiceState !== "idle"}
            isMuted={isMuted}
            onToggleMute={toggleMute}
            onEndCall={endCall}
            onBookCall={handleBookCall}
            contactInfo={{
              name: DEMO_EMPLOYEE.name,
              email: DEMO_EMPLOYEE.email,
              phone: DEMO_EMPLOYEE.phone,
              company: DEMO_EMPLOYEE.companyName,
              designation: DEMO_EMPLOYEE.designation,
              website: DEMO_EMPLOYEE.website,
            }}
          />
        </Card>

        {/* Footer Credit */}
        <p className="text-center text-[11px] text-slate-400 font-mono">
          Powered by Vapi AI Voice Engine &amp; Next.js Backend
        </p>
      </div>
    </main>
  );
}
