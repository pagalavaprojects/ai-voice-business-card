/**
 * Item 15 — the 2-day unused-contact eligibility rule, tested at the
 * boundary and against the application's own activity model. Pure logic:
 * no clock, no DB, no fixtures that bypass the rule.
 */
import {
  MAX_UNUSED_REMINDER_ATTEMPTS,
  UNUSED_CONTACT_AFTER_MS,
  UNUSED_CONTACT_UNTIL_MS,
  UNUSED_LEAD_FAILED_MARKER,
  UNUSED_LEAD_MARKER,
  contactKey,
  selectUnusedContacts,
  type TimelineEntry,
  type UnusedCandidate,
} from "@/core/application/services/UnusedContactReminder";

const NOW = Date.parse("2026-09-10T04:00:00.000Z"); // the cron's 04:00 UTC run
const H = 3600_000;
let seq = 0;
function lead(over: Partial<UnusedCandidate> = {}): UnusedCandidate {
  seq++;
  return {
    id: `lead-${seq}`,
    company_id: "c1",
    employee_id: "e1",
    name: `Lead ${seq}`,
    email: `lead${seq}@example.com`,
    phone: `+91 9000000${String(seq).padStart(3, "0")}`,
    status: "NEW",
    created_at: new Date(NOW - 60 * H).toISOString(), // 2.5 days old by default
    deleted_at: null,
    ...over,
  };
}
function run(leads: UnusedCandidate[], opts: { appointments?: string[]; activities?: Record<string, TimelineEntry[]>; now?: number } = {}) {
  return selectUnusedContacts({
    now: opts.now ?? NOW,
    leads,
    leadIdsWithAppointments: new Set(opts.appointments ?? []),
    activitiesByLead: new Map(Object.entries(opts.activities ?? {})),
  });
}
const reasonOf = (r: ReturnType<typeof run>, id: string) => r.excluded.find((e) => e.id === id)?.reason ?? null;

describe("the 2-day boundary (absolute 48h from created_at, stored UTC)", () => {
  it("is NOT eligible one millisecond before 48h", () => {
    const l = lead({ created_at: new Date(NOW - UNUSED_CONTACT_AFTER_MS + 1).toISOString() });
    expect(reasonOf(run([l]), l.id)).toBe("too_recent");
  });
  it("IS eligible at exactly 48h", () => {
    const l = lead({ created_at: new Date(NOW - UNUSED_CONTACT_AFTER_MS).toISOString() });
    expect(run([l]).eligible.map((x) => x.id)).toEqual([l.id]);
  });
  it("IS eligible after 48h and up to exactly 120h", () => {
    const a = lead({ created_at: new Date(NOW - UNUSED_CONTACT_AFTER_MS - 1).toISOString() });
    const b = lead({ created_at: new Date(NOW - UNUSED_CONTACT_UNTIL_MS).toISOString() });
    expect(run([a, b]).eligible.map((x) => x.id).sort()).toEqual([a.id, b.id].sort());
  });
  it("ages out one millisecond after 120h — one reminder, never a nudge weeks later", () => {
    const l = lead({ created_at: new Date(NOW - UNUSED_CONTACT_UNTIL_MS - 1).toISOString() });
    expect(reasonOf(run([l]), l.id)).toBe("aged_out");
  });
  it("is timezone-independent: the same instant written with an offset is the same age", () => {
    const utc = new Date(NOW - 50 * H).toISOString();
    const withOffset = utc.replace("Z", "+00:00");
    const ist = new Date(NOW - 50 * H + 5.5 * H).toISOString().replace("Z", "+05:30"); // same instant in IST
    const a = lead({ created_at: utc });
    const b = lead({ created_at: withOffset });
    const c = lead({ created_at: ist });
    expect(run([a, b, c]).eligible).toHaveLength(3);
  });
  it("fails safe on a missing or unparsable timestamp — never eligible", () => {
    const a = lead({ created_at: null });
    const b = lead({ created_at: "not-a-date" });
    const r = run([a, b]);
    expect(r.eligible).toHaveLength(0);
    expect(reasonOf(r, a.id)).toBe("invalid_timestamp");
    expect(reasonOf(r, b.id)).toBe("invalid_timestamp");
  });
});

describe("the application's own definition of 'used'", () => {
  it("excludes a lead that is no longer NEW/QUALIFIED (CONTACTED, BOOKED, DISQUALIFIED)", () => {
    const leads = ["CONTACTED", "BOOKED", "DISQUALIFIED"].map((status) => lead({ status }));
    const r = run(leads);
    expect(r.eligible).toHaveLength(0);
    for (const l of leads) expect(reasonOf(r, l.id)).toBe("status");
  });
  it("keeps QUALIFIED (answered data points but never booked) eligible", () => {
    const l = lead({ status: "QUALIFIED" });
    expect(run([l]).eligible).toHaveLength(1);
  });
  it("excludes a deleted lead even if a query returned it", () => {
    const l = lead({ deleted_at: new Date(NOW - H).toISOString() });
    expect(reasonOf(run([l]), l.id)).toBe("deleted");
  });
  it("excludes a lead with an appointment in ANY status — a cancelled booking still means the contact was used", () => {
    const l = lead();
    expect(reasonOf(run([l], { appointments: [l.id] }), l.id)).toBe("has_appointment");
  });
  it.each(["CALL", "EMAIL", "APPOINTMENT"])("excludes a lead with a %s activity on its timeline (contact was used)", (type) => {
    const l = lead();
    expect(reasonOf(run([l], { activities: { [l.id]: [{ type, content: "…" }] } }), l.id)).toBe("used");
  });
  it.each(["NOTE", "STATUS_CHANGE", "OWNER_CHANGE"])("does NOT treat a %s activity as usage", (type) => {
    const l = lead();
    expect(run([l], { activities: { [l.id]: [{ type, content: "Lead created" }] } }).eligible).toHaveLength(1);
  });
  it("a contact that became active again (a CALL after capture) is not reminded", () => {
    const l = lead({ created_at: new Date(NOW - 70 * H).toISOString() });
    const r = run([l], { activities: { [l.id]: [{ type: "STATUS_CHANGE", content: "Lead created" }, { type: "CALL", content: "Called back" }] } });
    expect(reasonOf(r, l.id)).toBe("used");
  });
});

describe("once only, with observable failures", () => {
  it("never reminds a lead that carries the success marker", () => {
    const l = lead();
    expect(reasonOf(run([l], { activities: { [l.id]: [{ type: "NOTE", content: UNUSED_LEAD_MARKER }] } }), l.id)).toBe("already_reminded");
  });
  it("stays retryable after fewer than the maximum failed attempts", () => {
    const l = lead();
    const fails = Array.from({ length: MAX_UNUSED_REMINDER_ATTEMPTS - 1 }, () => ({ type: "NOTE", content: UNUSED_LEAD_FAILED_MARKER }));
    expect(run([l], { activities: { [l.id]: fails } }).eligible).toHaveLength(1);
  });
  it("stops after the maximum failed attempts", () => {
    const l = lead();
    const fails = Array.from({ length: MAX_UNUSED_REMINDER_ATTEMPTS }, () => ({ type: "NOTE", content: UNUSED_LEAD_FAILED_MARKER }));
    expect(reasonOf(run([l], { activities: { [l.id]: fails } }), l.id)).toBe("attempts_exhausted");
  });
});

describe("duplicate contact records (existing lead dedup semantics)", () => {
  it("identifies a person by real e-mail (case-insensitive), else by phone digits; placeholder addresses identify nobody", () => {
    expect(contactKey({ email: "Asha@Example.com", phone: null })).toBe("email:asha@example.com");
    expect(contactKey({ email: "qualifying-1@placeholder.maylaanai.internal", phone: "+91 98888-12345" })).toBe("phone:919888812345");
    expect(contactKey({ email: null, phone: "12345" })).toBeNull();
    expect(contactKey({ email: "", phone: "" })).toBeNull();
  });
  it("reminds a person captured twice through their NEWEST record only", () => {
    const older = lead({ email: "same@example.com", created_at: new Date(NOW - 100 * H).toISOString() });
    const newer = lead({ email: "SAME@example.com", created_at: new Date(NOW - 60 * H).toISOString() });
    const r = run([older, newer]);
    expect(r.eligible.map((x) => x.id)).toEqual([newer.id]);
    expect(reasonOf(r, older.id)).toBe("duplicate_contact");
  });
  it("does not remind a person who booked / was contacted / was reminded under another record", () => {
    const booked = lead({ email: "p@example.com", created_at: new Date(NOW - 100 * H).toISOString() });
    const again = lead({ email: "p@example.com" });
    const r = run([booked, again], { appointments: [booked.id] });
    expect(r.eligible).toHaveLength(0);
    expect(reasonOf(r, again.id)).toBe("duplicate_contact");
  });
  it("treats two placeholder leads as two different people", () => {
    const a = lead({ email: "qualifying-a@placeholder.maylaanai.internal", phone: null });
    const b = lead({ email: "qualifying-b@placeholder.maylaanai.internal", phone: null });
    expect(run([a, b]).eligible).toHaveLength(2);
  });
});
