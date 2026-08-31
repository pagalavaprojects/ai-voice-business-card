import { CalcomAdapter } from "@/core/infrastructure/booking/calcom/CalcomAdapter";

/**
 * Cal.com's /v2/slots intermittently returns 500 INTERNAL_SERVER_ERROR
 * (observed live: it 500'd for a stretch, then recovered to 200 within the
 * hour), which surfaces to the visitor as "we couldn't load available times".
 * getAvailableSlots does ONE bounded retry on a 5xx — the GET is idempotent and
 * a 5xx comes back fast — recovering the common blip without fabricating slots.
 * A timeout is not retried (its 10s is the whole budget); a 4xx is not retried
 * (a real client/config error a retry can't fix).
 */

const KEY = "cal_live_realkey_abcdef123456";
const OK_BODY = { data: { "2026-09-01": [{ start: "2026-09-01T09:00:00.000+05:30" }, { start: "2026-09-01T09:30:00.000+05:30" }] } };
const ok = () => ({ ok: true, status: 200, json: async () => OK_BODY, text: async () => JSON.stringify(OK_BODY) });
const err = (status: number) => ({ ok: false, status, json: async () => ({}), text: async () => `HTTP ${status}` });

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

function seq(responses: unknown[]) {
  const fetchMock = jest.fn();
  responses.forEach((r) => fetchMock.mockResolvedValueOnce(r));
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe("CalcomAdapter.getAvailableSlots — one bounded retry on 5xx", () => {
  const adapter = new CalcomAdapter(KEY);
  const now = new Date().toISOString();
  const end = new Date(Date.now() + 7 * 864e5).toISOString();

  it("recovers a transient 500 with a single retry and returns the real slots", async () => {
    const fetchMock = seq([err(500), ok()]);
    const slots = await adapter.getAvailableSlots(123, now, end, "Asia/Kolkata");
    expect(fetchMock).toHaveBeenCalledTimes(2); // first 500, retried
    expect(slots.map((s) => s.time)).toEqual(["2026-09-01T09:00:00.000+05:30", "2026-09-01T09:30:00.000+05:30"]);
  });

  it("does not retry a 200 (no wasted second call)", async () => {
    const fetchMock = seq([ok()]);
    const slots = await adapter.getAvailableSlots(123, now, end, "Asia/Kolkata");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(slots).toHaveLength(2);
  });

  it("throws (honest error, no fabricated slots) when both attempts 5xx", async () => {
    const fetchMock = seq([err(500), err(503)]);
    await expect(adapter.getAvailableSlots(123, now, end, "Asia/Kolkata")).rejects.toThrow(/getAvailableSlots failed: 503/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a 4xx (a config/client error a retry can't fix)", async () => {
    const fetchMock = seq([err(404)]);
    await expect(adapter.getAvailableSlots(123, now, end, "Asia/Kolkata")).rejects.toThrow(/getAvailableSlots failed: 404/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns [] (empty, not an error) when Cal.com answers 200 with no availability", async () => {
    seq([{ ok: true, status: 200, json: async () => ({ data: {} }), text: async () => "{}" }]);
    const slots = await adapter.getAvailableSlots(123, now, end, "Asia/Kolkata");
    expect(slots).toEqual([]);
  });
});
