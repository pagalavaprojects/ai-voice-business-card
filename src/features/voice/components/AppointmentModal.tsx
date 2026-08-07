"use client";

import React, { useEffect, useState } from "react";
import { Clock, User, Mail, Phone, CheckCircle2, ArrowRight, Loader2, AlertTriangle } from "lucide-react";
import { Dialog } from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";

interface AppointmentModalProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
  employeeId: string;
  employeeName: string;
  companyName: string;
  externalBookingUrl?: string | null;
}

interface CalcomSlot {
  time: string;
}

type BookingOutcome = { confirmed: boolean; message: string };

/**
 * Real appointment booking, not a UI mockup — fetches genuine availability
 * from GET /api/public/{companyId}/{employeeId}/appointments and books
 * through the exact same save_lead + book_appointment tools the live voice
 * call uses (see that route for why). A prior version of this component
 * used a hardcoded slot list and a setTimeout(...) that always reported
 * "Appointment confirmed" — nothing was ever booked and no email was ever
 * sent. This version never claims a confirmation the backend didn't
 * actually report.
 */
export const AppointmentModal: React.FC<AppointmentModalProps> = ({
  open,
  onClose,
  companyId,
  employeeId,
  employeeName,
  companyName,
  externalBookingUrl,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [slots, setSlots] = useState<CalcomSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  // Distinguishes WHY the slot list is empty — "unconfigured" (this company
  // genuinely has no online booking set up) reads very differently to a
  // visitor than "error" (a transient Cal.com outage, try again shortly).
  // Conflating the two previously meant a real outage got misreported as
  // "this company doesn't support online booking," which isn't true.
  const [slotsReason, setSlotsReason] = useState<"unconfigured" | "error" | "rate_limited" | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", email: "", phone: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<BookingOutcome | null>(null);

  // Real availability, fetched fresh every time the modal opens — a slot
  // list cached across opens could go stale within the same visit.
  useEffect(() => {
    if (!open) return;
    setSlotsLoading(true);
    setSlotsReason(null);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    fetch(`/api/public/${companyId}/${employeeId}/appointments?timeZone=${encodeURIComponent(timeZone)}`)
      // The route always returns a JSON body — including on 429 — so parse
      // it regardless of status rather than throwing away the `reason`
      // field on a non-2xx response.
      .then((res) => res.json())
      .then((data: { slots?: CalcomSlot[]; reason?: "unconfigured" | "error" | "rate_limited" }) => {
        const list = data.slots ?? [];
        setSlots(list);
        setSelectedSlot(list[0]?.time ?? null);
        setSlotsReason(list.length === 0 ? data.reason ?? "error" : null);
      })
      // Only a genuine network-level failure (offline, DNS, CORS) reaches
      // here — anything the server itself responded to is handled above.
      .catch(() => setSlotsReason("error"))
      .finally(() => setSlotsLoading(false));
  }, [open, companyId, employeeId]);

  const formatSlot = (iso: string) =>
    new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(
      new Date(iso)
    );

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(`/api/public/${companyId}/${employeeId}/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          notes: formData.notes || undefined,
          startTime: selectedSlot,
          timeZone,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setSubmitError(data.message || "We couldn't process your request — please try again.");
        return;
      }
      // confirmed/message come straight from the server's honest result —
      // never upgraded to a more reassuring message here.
      setOutcome({ confirmed: Boolean(data.confirmed), message: data.message });
      setStep(3);
    } catch {
      setSubmitError("We couldn't reach the server — please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setFormData({ name: "", email: "", phone: "", notes: "" });
    setOutcome(null);
    setSubmitError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleReset} title="Book an Appointment" size="md">
      <div className="space-y-6">
        {/* Progress Bar */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-2">
            <span className={`h-6 w-6 rounded-full text-xs font-bold flex items-center justify-center ${step >= 1 ? "bg-sky-500 text-white" : "bg-slate-800 text-slate-400"}`}>1</span>
            <span className={`text-xs font-semibold ${step >= 1 ? "text-slate-200" : "text-slate-500"}`}>Select Time</span>
          </div>
          <div className="h-0.5 w-8 bg-slate-800" />
          <div className="flex items-center gap-2">
            <span className={`h-6 w-6 rounded-full text-xs font-bold flex items-center justify-center ${step >= 2 ? "bg-sky-500 text-white" : "bg-slate-800 text-slate-400"}`}>2</span>
            <span className={`text-xs font-semibold ${step >= 2 ? "text-slate-200" : "text-slate-500"}`}>Your Details</span>
          </div>
          <div className="h-0.5 w-8 bg-slate-800" />
          <div className="flex items-center gap-2">
            <span className={`h-6 w-6 rounded-full text-xs font-bold flex items-center justify-center ${step === 3 ? "bg-emerald-500 text-white" : "bg-slate-800 text-slate-400"}`}>3</span>
            <span className={`text-xs font-semibold ${step === 3 ? "text-emerald-400" : "text-slate-500"}`}>Done</span>
          </div>
        </div>

        {/* Step 1: Slot Selection */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-100">Choose a meeting slot</h3>
              <p className="text-xs text-slate-400">
                Book a 30-minute discovery consultation with {employeeName} from {companyName}.
              </p>
            </div>

            {slotsLoading && (
              <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading available times…
              </div>
            )}

            {!slotsLoading && (slotsReason === "error" || slotsReason === "rate_limited") && (
              <div role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  {slotsReason === "rate_limited"
                    ? "Too many attempts — please wait a moment and reopen this."
                    : "We couldn't load available times right now."}{" "}
                  {externalBookingUrl ? "You can still use the calendar link below." : "Please try again shortly, or reach out directly."}
                </span>
              </div>
            )}

            {!slotsLoading && slotsReason === "unconfigured" && (
              <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-slate-400">
                No online booking is configured yet for {employeeName}.{" "}
                {externalBookingUrl ? "Use the calendar link below, or " : ""}Contact them directly to arrange a time.
              </div>
            )}

            {!slotsLoading && slots.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {slots.map((slot) => (
                  <button
                    key={slot.time}
                    type="button"
                    onClick={() => setSelectedSlot(slot.time)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-medium transition-all ${
                      selectedSlot === slot.time
                        ? "bg-sky-500/10 border-sky-500/40 text-sky-300 shadow-md shadow-sky-500/10"
                        : "bg-white/[0.04] border-white/[0.08] text-slate-300 hover:border-white/20"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-sky-400" aria-hidden="true" />
                      {formatSlot(slot.time)}
                    </span>
                    {selectedSlot === slot.time && <CheckCircle2 className="h-4 w-4 text-sky-400" aria-hidden="true" />}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-white/[0.08]">
              {externalBookingUrl ? (
                <a href={externalBookingUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-400 hover:underline">
                  Open Cal.com Calendar &rarr;
                </a>
              ) : (
                <div />
              )}
              <Button variant="default" onClick={() => setStep(2)} disabled={!selectedSlot} className="flex items-center gap-2 text-xs">
                Next Step <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Contact Form */}
        {step === 2 && (
          <form onSubmit={handleBook} className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-100">Enter your contact info</h3>
              <p className="text-xs text-slate-400">
                Slot selected: <span className="text-sky-400 font-semibold">{selectedSlot ? formatSlot(selectedSlot) : "—"}</span>
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 font-medium" htmlFor="appt-name">Full Name</label>
                <div className="relative mt-1">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
                  <input
                    id="appt-name"
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="John Doe"
                    className="dashboard-input pl-9 w-full"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium" htmlFor="appt-email">Email Address</label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
                  <input
                    id="appt-email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="john@example.com"
                    className="dashboard-input pl-9 w-full"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium" htmlFor="appt-phone">Phone Number</label>
                <div className="relative mt-1">
                  <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
                  <input
                    id="appt-phone"
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+1 (555) 000-0000"
                    className="dashboard-input pl-9 w-full"
                  />
                </div>
              </div>
            </div>

            {submitError && (
              <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-200 text-xs">
                {submitError}
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-white/[0.08]">
              <Button type="button" variant="outline" onClick={() => setStep(1)} className="text-xs">
                Back
              </Button>
              <Button type="submit" disabled={submitting} className="flex items-center gap-2 text-xs">
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                {submitting ? "Booking…" : "Confirm Booking"}
              </Button>
            </div>
          </form>
        )}

        {/* Step 3: Real outcome — confirmed or requested, never both framed as "confirmed" */}
        {step === 3 && outcome && (
          <div className="text-center py-6 space-y-4">
            <div
              className={`mx-auto h-16 w-16 rounded-full border flex items-center justify-center ${
                outcome.confirmed
                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400 animate-bounce"
                  : "bg-sky-500/20 border-sky-500/40 text-sky-400"
              }`}
            >
              <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-100">{outcome.confirmed ? "Appointment Confirmed!" : "Request Received!"}</h3>
              <p className="text-xs text-slate-300">{outcome.message}</p>
              {selectedSlot && (
                <p className="text-[11px] text-slate-400 pt-1">
                  Preferred time: <span className="text-slate-200">{formatSlot(selectedSlot)}</span>
                </p>
              )}
            </div>
            <Button variant="outline" onClick={handleReset} className="text-xs mt-4">
              Done
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
};
