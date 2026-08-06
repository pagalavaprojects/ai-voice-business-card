"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Mail, Phone, Globe, MapPin, Clock, Calendar, Download, QrCode, MessageCircle, Linkedin, Link2, X } from "lucide-react";
import { useVapiSession } from "@/features/voice/hooks/useVapiSession";
import { VoiceMicButton } from "@/features/voice/components/VoiceMicButton";
import { TranscriptViewer } from "@/features/voice/components/TranscriptViewer";
import { Card } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { useToast } from "@/shared/ui/toast";
import { downloadVCard } from "@/features/voice/lib/vcard";

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
  branding?: { primaryColor: string | null; secondaryColor: string | null };
  services?: Array<{
    name: string;
    description: string;
    deliverables?: string[];
    timeline?: string;
    price?: number;
    currency?: string;
    imageUrl?: string | null;
    featured?: boolean;
    cta?: { label: string; url: string } | null;
  }>;
  products?: Array<{
    name: string;
    description: string;
    benefits?: string[];
    pricing?: number;
    currency?: string;
    discountPercent?: number | null;
    imageUrl?: string | null;
    featured?: boolean;
    cta?: { label: string; url: string } | null;
  }>;
  suggestedQuestions?: string[];
  socialLinks?: Record<string, string>;
  whatsappUrl?: string | null;
  qrSvg?: string | null;
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

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export default function VoiceBusinessCardPage() {
  const params = useParams();
  const companyId = (params?.companyId as string) || "";
  const employeeId = (params?.employeeId as string) || "";
  const { showToast } = useToast();

  // No demo/fallback identity: a business card that silently renders someone
  // else's name and speaks their pitch is worse than one that admits it
  // couldn't load. Every field below comes from the database or nothing does.
  const [card, setCard] = useState<PublicCardData | null>(null);
  const [cardLoading, setCardLoading] = useState(true);
  const [loadError, setLoadError] = useState<"notfound" | "unavailable" | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

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

  const { voiceState, isMuted, messages, durationSeconds, error, startCall, endCall, toggleMute } = useVapiSession({
    companyId,
    employeeId,
    firstMessage: card?.firstMessage,
    systemPrompt: card?.systemPrompt,
    tools: card?.tools,
    serverUrl: card?.serverUrl,
    voiceId: card?.voiceId,
  });

  const isCallActive = voiceState !== "idle";

  // "Online" reflects whether the AI can actually take a call right now, which
  // is always — it is not gated on the human's working hours. Those are shown
  // separately so a visitor knows when a human follow-up is likely.
  const statusLabel = useMemo(() => {
    if (voiceState === "idle") return "Available now";
    if (voiceState === "connecting") return "Connecting…";
    if (voiceState === "speaking") return "Speaking";
    if (voiceState === "thinking") return "Thinking…";
    return "Listening";
  }, [voiceState]);

  if (cardLoading) {
    return (
      <main className="min-h-screen bg-[#070b12] flex items-center justify-center p-4">
        <div role="status" aria-live="polite" className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-sky-400/30 border-t-sky-400 animate-spin" />
          <p className="text-xs text-slate-400">Loading business card…</p>
        </div>
      </main>
    );
  }

  if (!card) {
    return (
      <main className="min-h-screen bg-[#070b12] flex items-center justify-center p-4">
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

  const { company, employee } = card;
  const linkedIn = card.socialLinks?.linkedin || card.socialLinks?.linkedIn;
  // LinkedIn gets its own branded button below, so it's excluded here rather
  // than appearing twice — once with its icon, once as a generic link.
  const otherLinks = Object.entries(card.socialLinks ?? {}).filter(([label]) => !/^linkedin$/i.test(label));

  const contact = {
    name: employee.name,
    email: employee.email,
    phone: employee.phone,
    company: company.name,
    designation: employee.designation,
    website: company.website,
    links: Object.fromEntries(otherLinks.concat(linkedIn ? [["LinkedIn", linkedIn]] : [])),
  };

  return (
    <main className="min-h-screen bg-[#070b12] text-slate-100 py-6 px-4 sm:py-10">
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[34rem] h-[34rem] bg-sky-500/10 blur-[140px] rounded-full" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-indigo-500/[0.07] blur-[130px] rounded-full" />
      </div>

      <div className="relative z-10 w-full max-w-lg mx-auto space-y-4">
        {/* ---------- Identity ---------- */}
        <Card className="glass-panel border-white/[0.08] shadow-2xl rounded-3xl p-6 sm:p-8 space-y-6">
          {company.logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={company.logoUrl} alt={`${company.name} logo`} className="h-8 w-auto mx-auto object-contain" />
          ) : (
            <p className="text-center text-[11px] uppercase tracking-[0.2em] text-slate-400 font-semibold">{company.name}</p>
          )}

          <div className="flex flex-col items-center text-center space-y-3">
            <div className="relative">
              <div className="h-24 w-24 rounded-full border-2 border-sky-400/40 p-1 bg-gradient-to-br from-sky-500/20 to-indigo-500/20 shadow-lg shadow-sky-500/20">
                <div className="h-full w-full rounded-full bg-slate-800 flex items-center justify-center text-2xl font-bold text-sky-400 overflow-hidden">
                  {employee.avatarUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={employee.avatarUrl} alt={employee.name} className="h-full w-full object-cover" />
                  ) : (
                    initialsOf(employee.name)
                  )}
                </div>
              </div>
              <span
                className={`absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-[#070b12] ${
                  isCallActive ? "bg-sky-400 animate-pulse" : "bg-emerald-400"
                }`}
                aria-hidden="true"
              />
            </div>

            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-50">{employee.name}</h1>
              <p className="text-sm font-semibold text-sky-400">{employee.designation}</p>
              <p className="text-xs text-slate-400 mt-0.5">{company.name}</p>
            </div>

            <Badge variant={isCallActive ? "default" : "success"} aria-live="polite" aria-atomic="true">
              ● {statusLabel}
            </Badge>

            <div className="flex flex-wrap justify-center gap-2 pt-1">
              {employee.officeAddress && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-300 bg-white/[0.05] border border-white/[0.08] rounded-full px-3 py-1">
                  <MapPin className="h-3 w-3 text-sky-400" aria-hidden="true" />
                  {employee.officeAddress}
                </span>
              )}
              {employee.workingHours && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-300 bg-white/[0.05] border border-white/[0.08] rounded-full px-3 py-1">
                  <Clock className="h-3 w-3 text-sky-400" aria-hidden="true" />
                  {employee.workingHours}
                </span>
              )}
            </div>
          </div>

          {/* ---------- Voice ---------- */}
          <div className="flex flex-col items-center pt-2 border-t border-white/[0.06]">
            <div className="flex items-center gap-2 mb-3 mt-5">
              {durationSeconds > 0 && (
                <span
                  className="text-xs font-mono text-slate-300 font-semibold tabular-nums"
                  aria-label={`Call duration ${formatTimer(durationSeconds)}`}
                >
                  {formatTimer(durationSeconds)}
                </span>
              )}
            </div>

            <VoiceMicButton state={voiceState} isMuted={isMuted} onClick={isCallActive ? endCall : startCall} />

            <p className="text-sm text-slate-200 text-center font-semibold mt-4">
              {isCallActive ? "Speak naturally — I'm listening" : `Talk with ${employee.name.split(" ")[0]}'s AI`}
            </p>
            <p className="text-xs text-slate-400 text-center mt-1 max-w-xs">
              {isCallActive
                ? "Responses stream in real time. Tap the microphone to end."
                : "Ask anything about what we do. Your browser will ask for microphone access."}
            </p>

            {error && (
              <div
                role="alert"
                className="mt-4 w-full p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-200 text-xs text-center"
              >
                {error}
              </div>
            )}

            {isCallActive && (
              <div className="flex gap-2 mt-4">
                <Button variant="outline" size="sm" onClick={toggleMute} className="text-xs">
                  {isMuted ? "Unmute" : "Mute"}
                </Button>
                <Button variant="outline" size="sm" onClick={endCall} className="text-xs">
                  End call
                </Button>
              </div>
            )}
          </div>

          {/* ---------- Try asking ---------- */}
          {!isCallActive && card.suggestedQuestions && card.suggestedQuestions.length > 0 && (
            <section aria-labelledby="try-asking" className="border-t border-white/[0.06] pt-4">
              <h2 id="try-asking" className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2.5">
                Try asking
              </h2>
              <ul className="space-y-1.5">
                {card.suggestedQuestions.map((q) => (
                  <li key={q}>
                    {/* Starts the call and leaves the question on screen to read
                        aloud. The opening line is fixed by the voice provider,
                        so pretending to "ask it for you" would be a lie. */}
                    <button
                      type="button"
                      onClick={startCall}
                      className="w-full text-left text-xs text-slate-200 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-sky-400/40 rounded-xl px-3 py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      &ldquo;{q}&rdquo;
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <TranscriptViewer messages={messages} />
        </Card>

        {/* ---------- Services ---------- */}
        {card.services && card.services.length > 0 && (
          <Card className="glass-panel border-white/[0.08] rounded-3xl p-6" aria-labelledby="services-heading">
            <h2 id="services-heading" className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-3">
              What we do
            </h2>
            <ul className="space-y-4">
              {card.services.map((s) => (
                <li key={s.name} className="flex gap-3">
                  {s.imageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={s.imageUrl}
                      alt=""
                      className="h-14 w-14 rounded-xl object-cover border border-white/[0.08] shrink-0"
                      loading="lazy"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-bold text-slate-100">
                      {s.name}
                      {s.featured && (
                        <span className="ml-2 text-[9px] uppercase tracking-wide text-amber-300 bg-amber-400/10 border border-amber-400/25 rounded-full px-1.5 py-0.5 align-middle">
                          Featured
                        </span>
                      )}
                    </p>
                    {typeof s.price === "number" && s.price > 0 && (
                      <span className="text-xs font-mono text-sky-400 whitespace-nowrap">
                        {s.currency === "USD" ? "$" : `${s.currency ?? ""} `}
                        {s.price}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed mt-1">{s.description}</p>
                  {s.timeline && <p className="text-[11px] text-sky-400 mt-1.5 font-medium">{s.timeline}</p>}
                  {s.deliverables && s.deliverables.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {s.deliverables.map((d) => (
                        <li key={d} className="text-[10px] text-slate-300 bg-white/[0.05] border border-white/[0.08] rounded-full px-2.5 py-1">
                          {d}
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.cta && (
                    <a
                      href={s.cta.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block mt-2 text-[11px] font-semibold text-sky-300 hover:text-sky-200 underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-sky-500 rounded"
                    >
                      {s.cta.label} &rarr;
                    </a>
                  )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* ---------- Products ---------- */}
        {card.products && card.products.length > 0 && (
          <Card className="glass-panel border-white/[0.08] rounded-3xl p-6" aria-labelledby="products-heading">
            <h2 id="products-heading" className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-3">
              Products
            </h2>
            <ul className="space-y-4">
              {card.products.map((p) => (
                <li key={p.name} className="flex gap-3">
                  {p.imageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={p.imageUrl}
                      alt=""
                      // Decorative alongside the visible name — empty alt keeps
                      // screen readers from announcing the filename.
                      className="h-14 w-14 rounded-xl object-cover border border-white/[0.08] shrink-0"
                      loading="lazy"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-bold text-slate-100 truncate">
                        {p.name}
                        {p.featured && (
                          <span className="ml-2 text-[9px] uppercase tracking-wide text-amber-300 bg-amber-400/10 border border-amber-400/25 rounded-full px-1.5 py-0.5 align-middle">
                            Featured
                          </span>
                        )}
                      </p>
                      {typeof p.pricing === "number" && p.pricing > 0 && (
                        <span className="text-xs font-mono text-sky-400 whitespace-nowrap">
                          {p.currency === "USD" ? "$" : `${p.currency ?? ""} `}
                          {p.pricing}
                          {p.discountPercent ? <span className="text-emerald-400 ml-1.5">−{p.discountPercent}%</span> : null}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed mt-1">{p.description}</p>
                    {p.cta && (
                      <a
                        href={p.cta.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block mt-2 text-[11px] font-semibold text-sky-300 hover:text-sky-200 underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-sky-500 rounded"
                      >
                        {p.cta.label} →
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* ---------- Actions ---------- */}
        <Card className="glass-panel border-white/[0.08] rounded-3xl p-6 space-y-3" aria-labelledby="actions-heading">
          <h2 id="actions-heading" className="sr-only">
            Contact and actions
          </h2>

          {card.bookingUrl && (
            <Button
              variant="default"
              onClick={() => window.open(card.bookingUrl as string, "_blank", "noopener,noreferrer")}
              className="w-full flex items-center justify-center gap-2 text-xs"
            >
              <Calendar className="h-4 w-4" aria-hidden="true" />
              Book a meeting
            </Button>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="glass"
              onClick={() => downloadVCard(contact)}
              className="w-full flex items-center justify-center gap-2 text-xs"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Save contact
            </Button>
            <Button
              variant="glass"
              onClick={() => setQrOpen(true)}
              disabled={!card.qrSvg}
              className="w-full flex items-center justify-center gap-2 text-xs"
            >
              <QrCode className="h-4 w-4" aria-hidden="true" />
              Share QR
            </Button>
          </div>

          <ul className="grid grid-cols-2 gap-2 pt-1">
            <ContactLink href={`mailto:${employee.email}`} icon={<Mail className="h-3.5 w-3.5" />} label={employee.email} />
            <ContactLink href={`tel:${employee.phone}`} icon={<Phone className="h-3.5 w-3.5" />} label={employee.phone} />
            {card.whatsappUrl && (
              <ContactLink href={card.whatsappUrl} icon={<MessageCircle className="h-3.5 w-3.5" />} label="WhatsApp" external />
            )}
            {linkedIn && <ContactLink href={linkedIn} icon={<Linkedin className="h-3.5 w-3.5" />} label="LinkedIn" external />}
            {company.website && (
              <ContactLink href={company.website} icon={<Globe className="h-3.5 w-3.5" />} label="Website" external />
            )}
            {otherLinks.map(([label, url]) => (
              <ContactLink key={label} href={url} icon={<Link2 className="h-3.5 w-3.5" />} label={label} external />
            ))}
          </ul>
        </Card>

        <p className="text-center text-[11px] text-slate-400 font-mono pb-4">AI Integrated. Growth Automated.</p>
      </div>

      <Dialog open={qrOpen} onClose={() => setQrOpen(false)} title="Scan to open this card" size="sm">
        <div className="flex flex-col items-center gap-4">
          {card.qrSvg && (
            <div
              className="bg-white p-3 rounded-2xl w-56 h-56 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
              // Generated server-side by the `qrcode` package from this card's
              // own URL — not user-supplied content.
              dangerouslySetInnerHTML={{ __html: card.qrSvg }}
            />
          )}
          <p className="text-xs text-slate-400 text-center">Point a phone camera here to open {employee.name}&apos;s AI business card.</p>
          <Button variant="outline" size="sm" onClick={() => setQrOpen(false)} className="text-xs">
            <X className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
            Close
          </Button>
        </div>
      </Dialog>
    </main>
  );
}

function ContactLink({
  href,
  icon,
  label,
  external,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  external?: boolean;
}) {
  return (
    <li>
      <a
        href={href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className="flex items-center gap-2 text-[11px] text-slate-300 hover:text-sky-300 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] rounded-xl px-3 py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 truncate"
      >
        <span className="text-sky-400 shrink-0" aria-hidden="true">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </a>
    </li>
  );
}
