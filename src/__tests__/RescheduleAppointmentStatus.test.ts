/**
 * Rescheduling changes the TIME, not the confirmation state.
 *
 * The bug: rescheduleAppointment hard-coded status: "BOOKED". A REQUESTED
 * appointment (a lead's stated preference that never made it onto a calendar,
 * so it has no calcom_booking_id) would silently become BOOKED on a
 * reschedule, and the reschedule route then emails the lead that their meeting
 * is confirmed at the new time — a confirmation that never happened.
 */

let capturedUpdate: Record<string, unknown> | null = null;
let existingRow: Record<string, unknown> = {};

jest.mock("@/shared/lib/supabase", () => ({
  supabaseAdmin: {
    from: () => ({
      // getAppointmentById: select().eq().single()
      select: () => ({
        eq: () => ({
          single: async () => ({ data: existingRow, error: null }),
        }),
      }),
      // rescheduleAppointment update: update().eq().select().single()
      update: (payload: Record<string, unknown>) => {
        capturedUpdate = payload;
        return {
          eq: () => ({
            select: () => ({
              single: async () => ({ data: { ...existingRow, ...payload }, error: null }),
            }),
          }),
        };
      },
    }),
  },
}));

import { SupabaseBookingRepository } from "@/core/infrastructure/database/supabase/SupabaseBookingRepository";

describe("rescheduleAppointment preserves confirmation state", () => {
  const repo = new SupabaseBookingRepository();

  beforeEach(() => {
    capturedUpdate = null;
  });

  it("keeps a never-confirmed REQUESTED appointment as REQUESTED", async () => {
    existingRow = { id: "a1", status: "REQUESTED", calcom_booking_id: null, start_time: "old", end_time: "old" };
    await repo.rescheduleAppointment("a1", "2026-09-02T10:00:00.000Z", "2026-09-02T10:30:00.000Z");
    expect(capturedUpdate).toMatchObject({ start_time: "2026-09-02T10:00:00.000Z", status: "REQUESTED" });
  });

  it("keeps a genuinely booked (Cal.com-backed) appointment BOOKED", async () => {
    existingRow = { id: "a2", status: "BOOKED", calcom_booking_id: "cal_abc", start_time: "old", end_time: "old" };
    await repo.rescheduleAppointment("a2", "2026-09-02T11:00:00.000Z", "2026-09-02T11:30:00.000Z");
    expect(capturedUpdate).toMatchObject({ status: "BOOKED" });
  });
});
