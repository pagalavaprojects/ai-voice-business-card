import { NextRequest } from "next/server";

/**
 * Workflow-state guards on the cancel/reschedule routes.
 *
 * Two business-logic gaps this pins shut:
 *  - Cancelling an ALREADY-cancelled appointment must be a no-op, not a second
 *    Cal.com cancellation + a second "your meeting is cancelled" email.
 *  - A cancelled appointment must NOT be reschedulable: cancelling leaves the
 *    calcom_booking_id in place, so rescheduleAppointment would recompute the
 *    status to BOOKED and silently resurrect a booking the owner cancelled.
 */

const requireCompanyDataScope = jest.fn(async (..._a: unknown[]) => ({ employeeId: null as string | null }));
jest.mock("@/shared/lib/tenant", () => ({
  requireCompanyDataScope: (...a: unknown[]) => requireCompanyDataScope(...a),
}));

const getAppointmentById = jest.fn();
const cancelAppointment = jest.fn(async (..._a: unknown[]) => ({ id: "appt-1", status: "CANCELLED" }));
const rescheduleAppointment = jest.fn(async (..._a: unknown[]) => ({ id: "appt-1", status: "BOOKED" }));
jest.mock("@/core/infrastructure/database/supabase/SupabaseBookingRepository", () => ({
  SupabaseBookingRepository: jest.fn().mockImplementation(() => ({
    getAppointmentById: (...a: unknown[]) => getAppointmentById(...a),
    cancelAppointment: (...a: unknown[]) => cancelAppointment(...a),
    rescheduleAppointment: (...a: unknown[]) => rescheduleAppointment(...a),
  })),
}));

const cancelBooking = jest.fn();
const rescheduleBooking = jest.fn();
jest.mock("@/core/infrastructure/booking/calcom/CalcomAdapter", () => ({
  CalcomAdapter: jest.fn().mockImplementation(() => ({
    cancelBooking: (...a: unknown[]) => cancelBooking(...a),
    rescheduleBooking: (...a: unknown[]) => rescheduleBooking(...a),
  })),
}));

const getLeadById = jest.fn(async (..._a: unknown[]) => ({ id: "lead-1", name: "V", email: "v@example.com" }));
jest.mock("@/core/infrastructure/database/supabase/SupabaseCRMRepository", () => ({
  SupabaseCRMRepository: jest.fn().mockImplementation(() => ({ getLeadById: (...a: unknown[]) => getLeadById(...a) })),
}));

const send = jest.fn(async (..._a: unknown[]) => ({ success: true }));
jest.mock("@/core/application/services/NotificationService", () => ({
  NotificationService: jest.fn().mockImplementation(() => ({ send: (...a: unknown[]) => send(...a) })),
}));
jest.mock("@/core/infrastructure/email/ResendEmailAdapter", () => ({ ResendEmailAdapter: jest.fn() }));
jest.mock("@/core/infrastructure/database/supabase/SupabaseEmailLogRepository", () => ({ SupabaseEmailLogRepository: jest.fn() }));

import { PUT as cancelPUT } from "@/app/api/admin/appointments/[appointmentId]/cancel/route";
import { PUT as reschedulePUT } from "@/app/api/admin/appointments/[appointmentId]/reschedule/route";

const COMPANY = "11111111-1111-1111-1111-111111111111";
const PARAMS = { params: { appointmentId: "appt-1" } };
function put(body: unknown) {
  return new NextRequest("http://localhost/api/admin/appointments/appt-1", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  requireCompanyDataScope.mockResolvedValue({ employeeId: null });
});

describe("cancel route — already-cancelled is an idempotent no-op", () => {
  it("does not re-cancel Cal.com or re-email when the appointment is already CANCELLED", async () => {
    getAppointmentById.mockResolvedValue({ id: "appt-1", company_id: COMPANY, employee_id: "e1", status: "CANCELLED", calcom_booking_id: "cal_1", lead_id: "lead-1", start_time: "2026-09-01T10:00:00.000Z" });

    const res = await cancelPUT(put({ company_id: COMPANY }), PARAMS);

    expect(res.status).toBe(200);
    expect(cancelBooking).not.toHaveBeenCalled();
    expect(cancelAppointment).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("still cancels an active (BOOKED) appointment", async () => {
    getAppointmentById.mockResolvedValue({ id: "appt-1", company_id: COMPANY, employee_id: "e1", status: "BOOKED", calcom_booking_id: "cal_1", lead_id: "lead-1", start_time: "2026-09-01T10:00:00.000Z" });

    const res = await cancelPUT(put({ company_id: COMPANY }), PARAMS);

    expect(res.status).toBe(200);
    expect(cancelBooking).toHaveBeenCalledTimes(1);
    expect(cancelAppointment).toHaveBeenCalledTimes(1);
  });
});

describe("reschedule route — a cancelled appointment cannot be resurrected", () => {
  it("refuses to reschedule a CANCELLED appointment (409), no Cal.com re-book", async () => {
    getAppointmentById.mockResolvedValue({ id: "appt-1", company_id: COMPANY, employee_id: "e1", status: "CANCELLED", calcom_booking_id: "cal_1", lead_id: "lead-1", start_time: "2026-09-01T10:00:00.000Z" });

    const res = await reschedulePUT(put({ company_id: COMPANY, start_time: "2026-09-05T10:00:00.000Z", end_time: "2026-09-05T10:30:00.000Z" }), PARAMS);

    expect(res.status).toBe(409);
    expect(rescheduleBooking).not.toHaveBeenCalled();
    expect(rescheduleAppointment).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("still reschedules an active BOOKED appointment", async () => {
    getAppointmentById.mockResolvedValue({ id: "appt-1", company_id: COMPANY, employee_id: "e1", status: "BOOKED", calcom_booking_id: "cal_1", lead_id: "lead-1", start_time: "2026-09-01T10:00:00.000Z" });

    const res = await reschedulePUT(put({ company_id: COMPANY, start_time: "2026-09-05T10:00:00.000Z", end_time: "2026-09-05T10:30:00.000Z" }), PARAMS);

    expect(res.status).toBe(200);
    expect(rescheduleAppointment).toHaveBeenCalledTimes(1);
  });
});
