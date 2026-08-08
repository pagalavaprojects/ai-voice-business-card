import { isPlaceholderCredential } from "@/shared/lib/security";

export interface CalcomBookingRequest {
  eventTypeId: number;
  start: string; // ISO string
  end: string;   // ISO string
  responses: {
    name: string;
    email: string;
    location?: string;
  };
  timeZone: string;
}

export interface CalcomBookingResponse {
  id: number;
  uid: string;
  title: string;
  meetingUrl?: string;
  status: string;
}

export interface CalcomSlot {
  time: string;
}

/** Thrown when a real booking is impossible because Cal.com isn't configured.
 * Typed so callers can degrade deliberately — capturing the visitor's
 * preferred time as REQUESTED — instead of reporting a confirmed meeting. */
export class CalcomUnavailableError extends Error {
  constructor() {
    super("Cal.com is not configured — CALCOM_API_KEY is missing or a placeholder");
    this.name = "CalcomUnavailableError";
  }
}

export class CalcomAdapter {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.CALCOM_API_KEY || "";
  }

  isConfigured(): boolean {
    return !isPlaceholderCredential(this.apiKey);
  }

  async getAvailableSlots(eventTypeId: number, dateFrom: string, dateTo: string, timeZone: string): Promise<CalcomSlot[]> {
    if (!this.isConfigured()) {
      // Demo fallback: three slots an hour apart starting tomorrow.
      const base = new Date(dateFrom);
      base.setDate(base.getDate() + 1);
      base.setHours(10, 0, 0, 0);
      return [0, 1, 2].map((i) => {
        const slot = new Date(base);
        slot.setHours(slot.getHours() + i);
        return { time: slot.toISOString() };
      });
    }

    // API v2 — v1 was decommissioned by Cal.com (verified live: every v1
    // endpoint now returns "API v1 has been decommissioned"). v2
    // authenticates with a Bearer key and versions each endpoint through a
    // cal-api-version header.
    const params = new URLSearchParams({
      eventTypeId: String(eventTypeId),
      start: dateFrom,
      end: dateTo,
      timeZone,
    });
    const response = await fetch(`https://api.cal.com/v2/slots?${params.toString()}`, {
      headers: { Authorization: `Bearer ${this.apiKey}`, "cal-api-version": "2024-09-04" },
    });
    if (!response.ok) throw new Error(`CalcomAdapter.getAvailableSlots failed: ${response.status} ${await response.text()}`);

    // Shape (verified against the live API): { data: { "YYYY-MM-DD":
    // [{ start: ISO }] } }
    const json = await response.json();
    const slotsByDate = (json.data ?? {}) as Record<string, Array<{ start: string }>>;
    return Object.values(slotsByDate)
      .flat()
      .map((s) => ({ time: s.start }));
  }

  async createBooking(request: CalcomBookingRequest): Promise<CalcomBookingResponse> {
    if (!this.isConfigured()) {
      // Throws rather than returning a fabricated booking.
      //
      // This previously returned a synthetic id and a dead
      // "cal.com/demo-meeting" URL with status ACCEPTED, which callers stored
      // and reported as a confirmed meeting. Nobody was ever booked and no
      // invite was sent — the visitor simply never heard from anyone.
      //
      // Same reasoning as OpenAIEmbeddingAdapter refusing to invent vectors:
      // a fake success is worse than a clean failure, because the caller can
      // handle a failure honestly and cannot detect a convincing lie.
      throw new CalcomUnavailableError();
    }

    const response = await fetch("https://api.cal.com/v2/bookings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "cal-api-version": "2024-08-13",
      },
      body: JSON.stringify({
        eventTypeId: request.eventTypeId,
        start: request.start,
        attendee: {
          name: request.responses.name,
          email: request.responses.email,
          timeZone: request.timeZone,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`CalcomAdapter.createBooking failed: ${response.status} ${errorText}`);
    }

    const json = await response.json();
    const booking = json.data ?? {};
    const location = typeof booking.location === "string" && booking.location.startsWith("http") ? booking.location : undefined;
    return {
      id: booking.id,
      uid: booking.uid,
      title: booking.title,
      meetingUrl: booking.meetingUrl || location || `https://app.cal.com/booking/${booking.uid}`,
      status: booking.status,
    };
  }

  async rescheduleBooking(bookingUid: string, newStart: string, newEnd: string): Promise<CalcomBookingResponse> {
    if (!this.isConfigured()) {
      return { id: 0, uid: bookingUid, title: "Rescheduled meeting (demo)", meetingUrl: "https://cal.com/demo-meeting", status: "ACCEPTED" };
    }

    const response = await fetch(`https://api.cal.com/v2/bookings/${bookingUid}/reschedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}`, "cal-api-version": "2024-08-13" },
      // v2 derives the new end from the event type's own duration.
      body: JSON.stringify({ start: newStart }),
    });

    if (!response.ok) throw new Error(`CalcomAdapter.rescheduleBooking failed: ${response.status} ${await response.text()} (requested end ${newEnd} is derived by Cal.com)`);

    const json = await response.json();
    const booking = json.data ?? {};
    return {
      id: booking.id,
      uid: booking.uid,
      title: booking.title,
      meetingUrl: booking.meetingUrl,
      status: booking.status,
    };
  }

  async cancelBooking(bookingUid: string, reason?: string): Promise<void> {
    if (!this.isConfigured()) return;

    const response = await fetch(`https://api.cal.com/v2/bookings/${bookingUid}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}`, "cal-api-version": "2024-08-13" },
      body: JSON.stringify({ cancellationReason: reason }),
    });

    if (!response.ok) throw new Error(`CalcomAdapter.cancelBooking failed: ${response.status} ${await response.text()}`);
  }
}
