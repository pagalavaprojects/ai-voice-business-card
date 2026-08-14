/**
 * @jest-environment jsdom
 *
 * Regression: a booking POST that resolves AFTER the visitor closed the
 * modal must not re-apply its outcome on top of the reset state. Before
 * the bookingSessionRef guard, the late resolution ran setOutcome +
 * setStep(3) against a modal the visitor had already closed and reset, so
 * the next open landed straight on the Done screen for a booking whose
 * confirmation the visitor never saw — with the "preferred time" recomputed
 * from a fresh slot list rather than the slot actually booked.
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { AppointmentModal } from "@/features/voice/components/AppointmentModal";

const t = (key: string, vars?: Record<string, string>) => (vars ? `${key}:${Object.values(vars).join("/")}` : key);

const SLOT = "2026-08-17T09:00:00.000Z";

describe("AppointmentModal — closing during an in-flight booking POST", () => {
  let resolveBooking: ((value: { ok: boolean; status: number; json: () => Promise<unknown> }) => void) | null = null;

  beforeEach(() => {
    resolveBooking = null;
    global.fetch = jest.fn((url: string, init?: { method?: string }) => {
      if (init?.method === "POST") {
        return new Promise((resolve) => {
          resolveBooking = resolve as never;
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ slots: [{ time: SLOT }] }),
      });
    }) as unknown as typeof fetch;
  });

  it("a late booking response after close is discarded — the Done screen never appears on the reset modal", async () => {
    render(
      <AppointmentModal
        open
        onClose={jest.fn()}
        companyId="comp-1"
        employeeId="emp-1"
        employeeName="Srinivasan Kandasamy"
        companyName="Pagalava Data Analytics"
        language="en"
        t={t}
      />
    );

    // No voice session → the modal opens on slot selection, and the fetched
    // slot list auto-selects its first entry.
    await waitFor(() => expect(screen.getByRole("button", { name: /appointment.nextStep/ })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /appointment.nextStep/ }));

    fireEvent.change(screen.getByLabelText("appointment.fullNameLabel"), { target: { value: "Test Visitor" } });
    fireEvent.change(screen.getByLabelText("appointment.emailLabel"), { target: { value: "visitor@example.com" } });
    fireEvent.change(screen.getByLabelText("appointment.phoneLabel"), { target: { value: "+911234567890" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /appointment.confirmBooking/ }));
    });
    expect(resolveBooking).not.toBeNull();

    // Visitor closes the modal (handleReset) while the POST is in flight.
    fireEvent.click(screen.getByRole("button", { name: "buttons.close" }));

    // The POST finally resolves — successfully, even — but it belongs to a
    // session the visitor already abandoned.
    await act(async () => {
      resolveBooking!({ ok: true, status: 200, json: async () => ({ success: true, confirmed: true }) });
      await Promise.resolve();
    });

    expect(screen.queryByText("appointment.confirmedTitle")).toBeNull();
    expect(screen.queryByText("appointment.requestedTitle")).toBeNull();
  });
});
