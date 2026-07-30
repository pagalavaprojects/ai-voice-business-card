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

export class CalcomAdapter {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.CALCOM_API_KEY || "";
  }

  async createBooking(request: CalcomBookingRequest): Promise<CalcomBookingResponse> {
    if (isPlaceholderCredential(this.apiKey)) {
      // Graceful fallback if live Cal.com API key is not yet configured
      return {
        id: Math.floor(Math.random() * 100000),
        uid: `cal_demo_${Date.now()}`,
        title: `Meeting with ${request.responses.name}`,
        meetingUrl: "https://cal.com/demo-meeting",
        status: "ACCEPTED",
      };
    }

    const response = await fetch("https://api.cal.com/v1/bookings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        eventTypeId: request.eventTypeId,
        start: request.start,
        responses: request.responses,
        timeZone: request.timeZone,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`CalcomAdapter.createBooking failed: ${response.status} ${errorText}`);
    }

    const json = await response.json();
    return {
      id: json.booking.id,
      uid: json.booking.uid,
      title: json.booking.title,
      meetingUrl: json.booking.meetingUrl || `https://cal.com/m/${json.booking.uid}`,
      status: json.booking.status,
    };
  }
}
