/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import { AppointmentModal } from "@/features/voice/components/AppointmentModal";

/**
 * The Select-Time step must tell the truth about WHY there are no slots.
 *
 * The bug: an empty-but-SUCCESSFUL Cal.com response (0 open slots, no `reason`)
 * was mapped to "error" and shown as "we couldn't load available times" — the
 * same message as a real provider outage. A genuine zero-availability answer
 * must read as "no available times", distinct from a provider failure.
 */

const t = (key: string, vars?: Record<string, string>) => (vars ? `${key}:${Object.values(vars).join("/")}` : key);

function view() {
  return (
    <AppointmentModal
      open
      onClose={jest.fn()}
      companyId="comp-1"
      employeeId="emp-1"
      employeeName="Srinivasan Kandasamy"
      companyName="Pagalava"
      language={"en" as never}
      t={t}
    />
  );
}

function mockSlots(body: unknown, status = 200) {
  global.fetch = jest.fn(async () => ({ ok: status < 400, status, json: async () => body })) as unknown as typeof fetch;
}

afterEach(() => jest.restoreAllMocks());

describe("Select Time — empty vs error is honest", () => {
  it("a SUCCESSFUL response with zero slots shows 'no available times', not the error", async () => {
    mockSlots({ configured: true, slots: [] });
    render(view());
    await waitFor(() => expect(screen.getByText(/appointment\.noSlots/)).toBeInTheDocument());
    expect(screen.queryByText(/appointment\.errorSlotsGeneric/)).toBeNull();
  });

  it("a provider ERROR (reason=error) shows the provider-error message", async () => {
    mockSlots({ configured: false, slots: [], reason: "error" });
    render(view());
    await waitFor(() => expect(screen.getByText(/appointment\.errorSlotsGeneric/)).toBeInTheDocument());
    expect(screen.queryByText(/appointment\.noSlots/)).toBeNull();
  });

  it("real slots render normally (neither empty nor error copy)", async () => {
    mockSlots({ configured: true, slots: [{ time: "2027-01-01T09:00:00.000Z" }, { time: "2027-01-01T09:30:00.000Z" }] });
    render(view());
    await waitFor(() => {
      expect(screen.queryByText(/appointment\.noSlots/)).toBeNull();
      expect(screen.queryByText(/appointment\.errorSlotsGeneric/)).toBeNull();
    });
  });
});
