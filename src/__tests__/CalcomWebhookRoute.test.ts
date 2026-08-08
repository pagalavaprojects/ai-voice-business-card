import { createHmac } from "crypto";
import { NextRequest } from "next/server";

/**
 * Regression test for the Cal.com webhook route's payload handling: it used
 * to do `JSON.parse(rawBody) as CalcomWebhookPayload` — a compile-time-only
 * cast with no runtime shape check — and on a genuine parse failure
 * returned a raw error message with a misleading 500 (server fault) rather
 * than 400 (the caller's malformed body). A valid HMAC signature only
 * proves the body wasn't tampered with in transit; it says nothing about
 * whether the JSON inside has the shape this route assumes.
 */

const maybeSingle = jest.fn();
const cancelAppointment = jest.fn();
const rescheduleAppointment = jest.fn();
const updateAppointmentStatus = jest.fn();

jest.mock("@/shared/lib/supabase", () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) },
}));

jest.mock("@/core/infrastructure/database/supabase/SupabaseBookingRepository", () => ({
  SupabaseBookingRepository: jest.fn().mockImplementation(() => ({
    cancelAppointment: (...args: unknown[]) => cancelAppointment(...args),
    rescheduleAppointment: (...args: unknown[]) => rescheduleAppointment(...args),
    updateAppointmentStatus: (...args: unknown[]) => updateAppointmentStatus(...args),
  })),
}));

import { POST } from "@/app/api/webhooks/calcom/route";

const SECRET = "test-cal-secret";

function signedRequest(rawBody: string, secret: string | null = SECRET): NextRequest {
  const headers: Record<string, string> = {};
  if (secret) headers["x-cal-signature-256"] = createHmac("sha256", secret).update(rawBody).digest("hex");
  const req = new NextRequest("http://localhost/api/webhooks/calcom", { method: "POST", headers });
  req.text = async () => rawBody;
  return req;
}

describe("POST /api/webhooks/calcom", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, CALCOM_WEBHOOK_SECRET: SECRET, NODE_ENV: "production" };
    maybeSingle.mockResolvedValue({ data: { id: "appt-1" } });
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("processes a valid, correctly-signed BOOKING_CANCELLED payload", async () => {
    const body = JSON.stringify({ triggerEvent: "BOOKING_CANCELLED", payload: { uid: "booking-1" } });
    const res = await POST(signedRequest(body));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(cancelAppointment).toHaveBeenCalledWith("appt-1", "Cancelled via Cal.com");
  });

  it("rejects an invalid signature with 401, before any parsing or business logic", async () => {
    const body = JSON.stringify({ triggerEvent: "BOOKING_CANCELLED", payload: { uid: "booking-1" } });
    const res = await POST(signedRequest(body, "wrong-secret"));

    expect(res.status).toBe(401);
    expect(cancelAppointment).not.toHaveBeenCalled();
  });

  it("returns 400 (not 500) for a syntactically malformed body, and does not leak the raw parser error", async () => {
    const res = await POST(signedRequest("{not valid json"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(JSON.stringify(json)).not.toMatch(/at JSON\.parse|node_modules/);
  });

  it("returns a controlled 4xx when required fields are missing (no triggerEvent)", async () => {
    const body = JSON.stringify({ payload: { uid: "booking-1" } });
    const res = await POST(signedRequest(body));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(cancelAppointment).not.toHaveBeenCalled();
  });

  it("returns a controlled 4xx when payload.uid is missing", async () => {
    const body = JSON.stringify({ triggerEvent: "BOOKING_CANCELLED", payload: {} });
    const res = await POST(signedRequest(body));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("returns a controlled 4xx when a field has the wrong type (triggerEvent as a number)", async () => {
    const body = JSON.stringify({ triggerEvent: 12345, payload: { uid: "booking-1" } });
    const res = await POST(signedRequest(body));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(cancelAppointment).not.toHaveBeenCalled();
  });

  it("ignores a webhook for a booking uid with no matching local appointment, without erroring", async () => {
    maybeSingle.mockResolvedValue({ data: null });
    const body = JSON.stringify({ triggerEvent: "BOOKING_CANCELLED", payload: { uid: "unknown-booking" } });
    const res = await POST(signedRequest(body));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.status).toBe("ignored");
    expect(cancelAppointment).not.toHaveBeenCalled();
  });

  it("only reschedules when both startTime and endTime are present", async () => {
    const body = JSON.stringify({ triggerEvent: "BOOKING_RESCHEDULED", payload: { uid: "booking-1", startTime: "2026-09-01T10:00:00Z" } });
    const res = await POST(signedRequest(body));

    expect(res.status).toBe(200);
    expect(rescheduleAppointment).not.toHaveBeenCalled();
  });
});
