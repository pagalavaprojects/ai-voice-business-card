"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useVapiSession } from "@/features/voice/hooks/useVapiSession";
import { BusinessCardHeader } from "@/features/voice/components/BusinessCardHeader";
import { VoiceMicButton } from "@/features/voice/components/VoiceMicButton";
import { TranscriptViewer } from "@/features/voice/components/TranscriptViewer";
import { CallControls } from "@/features/voice/components/CallControls";
import { Card } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { useToast } from "@/shared/ui/toast";

interface PublicCardData {
  company: { name: string; website: string; logoUrl: string | null };
  employee: {
    name: string;
    designation: string;
    email: string;
    phone: string;
    officeAddress: string | null;
    workingHours: string | null;
    avatarUrl: string | null;
  };
  services?: Array<{ name: string; description: string; deliverables?: string[]; timeline?: string }>;
  bookingUrl?: string | null;
  firstMessage: string;
  systemPrompt?: string | null;
  tools?: unknown[];
  toolsEnabled?: boolean;
  serverUrl?: string;
  voiceId?: string;
}

function formatTimer(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export default function VoiceBusinessCardPage() {
  const params = useParams();
  const companyId = (params?.companyId as string) || "";
  const employeeId = (params?.employeeId as string) || "";
  const { showToast } = useToast();

  // No demo/fallback identity: a business card that silently renders someone
  // else's name and speaks their pitch is worse than one that admits it
  // couldn't load. Every field below comes from the database or the card
  // doesn't render at all.
  const [card, setCard] = useState<PublicCardData | null>(null);
  const [cardLoading, setCardLoading] = useState(true);
  const [loadError, setLoadError] = useState<"notfound" | "unavailable" | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/public/${companyId}/${employeeId}`)
      .then(async (res) => {
        if (res.ok) return (await res.json()) as PublicCardData;
        throw new Error(res.status === 404 ? "notfound" : "unavailable");
      })
      .then((data) => {
        if (cancelled) return;
        setCard(data);
        setLoadError(null);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setCard(null);
        setLoadError(err.message === "notfound" ? "notfound" : "unavailable");
      })
      .finally(() => {
        if (!cancelled) setCardLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [companyId, employeeId]);

  const {
    voiceState,
    isMuted,
    messages,
    durationSeconds,
    error,
    startCall,
    endCall,
    toggleMute,
  } = useVapiSession({
    companyId,
    employeeId,
    firstMessage: card?.firstMessage,
    systemPrompt: card?.systemPrompt,
    tools: card?.tools,
    serverUrl: card?.serverUrl,
    voiceId: card?.voiceId,
  });

  const handleBookCall = () => {
    if (!card?.bookingUrl) return;
    window.open(card.bookingUrl, "_blank", "noopener,noreferrer");
    showToast("Opening calendar booking page…", "info");
  };

  if (cardLoading) {
    return (
      <main className="min-h-screen bg-[#090d16] text-slate-100 flex items-center justify-center p-4">
        <div role="status" aria-live="polite" className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-sky-400/30 border-t-sky-400 animate-spin" />
          <p className="text-xs text-slate-400">Loading business card…</p>
        </div>
      </main>
    );
  }

  if (!card) {
    return (
      <main className="min-h-screen bg-[#090d16] text-slate-100 flex items-center justify-center p-4">
        <Card className="glass-panel border-white/[0.08] p-8 rounded-3xl max-w-sm text-center space-y-3">
          <h1 className="text-lg font-bold text-slate-100">
            {loadError === "notfound" ? "Business card not found" : "Card temporarily unavailable"}
          </h1>
          <p className="text-xs text-slate-400">
            {loadError === "notfound"
              ? "This link doesn't match an active business card. Please check the QR code or link and try again."
              : "We couldn't load this business card right now. Please try again in a moment."}
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#090d16] text-slate-100 flex items-center justify-center p-4 sm:p-6">
      {/* Glow Ambient Backdrop Effect */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-sky-500/10 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 w-full max-w-md space-y-6">
        {/* Main Card Container */}
        <Card className="glass-panel border-white/[0.08] shadow-2xl p-6 sm:p-8 rounded-3xl space-y-6">
          {/* Company logo — rendered from branding when the company has one */}
          {card.company.logoUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={card.company.logoUrl}
              alt={`${card.company.name} logo`}
              className="h-8 w-auto mx-auto object-contain"
            />
          )}

          {/* Employee Header */}
          <BusinessCardHeader
            name={card.employee.name}
            designation={card.employee.designation}
            companyName={card.company.name}
            email={card.employee.email}
            phone={card.employee.phone}
            website={card.company.website}
            office={card.employee.officeAddress || undefined}
            workingHours={card.employee.workingHours || undefined}
            avatarUrl={card.employee.avatarUrl || undefined}
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
                ? `Press the microphone to start a live voice session with ${card.employee.name.split(" ")[0]}'s AI Twin`
                : "Speak directly into your microphone. Response streamed in real-time."}
            </p>
          </div>

          {/* Live Streaming Transcript */}
          <TranscriptViewer messages={messages} />

          {/* Services — straight from the company's own records */}
          {card.services && card.services.length > 0 && (
            <section aria-labelledby="services-heading" className="border-t border-white/[0.06] pt-4">
              <h2 id="services-heading" className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-2">
                What we do
              </h2>
              <ul className="space-y-2">
                {card.services.map((service) => (
                  <li key={service.name} className="text-xs">
                    <p className="font-semibold text-slate-200">{service.name}</p>
                    <p className="text-slate-400 leading-relaxed">{service.description}</p>
                    {service.timeline && <p className="text-[11px] text-sky-400/90 mt-0.5">{service.timeline}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Action Controls */}
          <CallControls
            isActive={voiceState !== "idle"}
            isMuted={isMuted}
            onToggleMute={toggleMute}
            onEndCall={endCall}
            onBookCall={card.bookingUrl ? handleBookCall : undefined}
            contactInfo={{
              name: card.employee.name,
              email: card.employee.email,
              phone: card.employee.phone,
              company: card.company.name,
              designation: card.employee.designation,
              website: card.company.website,
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
