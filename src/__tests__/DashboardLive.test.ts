/**
 * The live dashboard's calculations — every number the overview shows runs
 * through these pure helpers, so each one is pinned here against real-shaped
 * rows: funnel counts from persisted Qn answer lines only, a conversion that
 * refuses to exist without a denominator, and an activity feed that is a
 * strict merge of persisted records.
 */
import { bookingConversionPercent, computeQualificationFunnel, mergeActivityFeed } from "@/shared/lib/dashboardLive";

const notes = (through: number) =>
  Array.from({ length: through }, (_, i) => `Q${i + 1} [YES] (2026-08-15T10:0${i}:00.000Z): Yes`).join("\n");

describe("computeQualificationFunnel", () => {
  it("counts each question from persisted answer lines and derives completion from Q6", () => {
    const rows = [
      { qualification_notes: notes(6) },
      { qualification_notes: notes(3) },
      { qualification_notes: notes(1) },
      { qualification_notes: null },
      { qualification_notes: "free text with no answers" },
    ];
    expect(computeQualificationFunnel(rows)).toEqual({ q1: 3, q2: 2, q3: 2, q4: 1, q5: 1, q6: 1, completed: 1 });
  });

  it("never counts lookalike text — only real `Qn [CLASSIFICATION]` lines", () => {
    const rows = [{ qualification_notes: "Q1 was discussed\nQ6 maybe later\nquestion 6 [YES]" }];
    expect(computeQualificationFunnel(rows).completed).toBe(0);
    expect(computeQualificationFunnel(rows).q1).toBe(0);
  });

  it("empty input produces genuine zeros, not fabricated progress", () => {
    expect(computeQualificationFunnel([])).toEqual({ q1: 0, q2: 0, q3: 0, q4: 0, q5: 0, q6: 0, completed: 0 });
  });
});

describe("bookingConversionPercent", () => {
  it("computes booked ÷ completed", () => {
    expect(bookingConversionPercent(3, 12)).toBe(25);
    expect(bookingConversionPercent(1, 3)).toBe(33.3);
  });

  it("is NULL (never 0%) when no qualifications completed — an unmeasurable ratio, not a measured failure", () => {
    expect(bookingConversionPercent(5, 0)).toBeNull();
    expect(bookingConversionPercent(0, 0)).toBeNull();
  });

  it("is a real 0% when qualifications completed but nothing booked", () => {
    expect(bookingConversionPercent(0, 4)).toBe(0);
  });
});

describe("mergeActivityFeed", () => {
  it("merges the three real sources newest-first and caps the feed", () => {
    const feed = mergeActivityFeed(
      [{ started_at: "2026-08-15T10:00:00Z", status: "SUMMARIZED", duration_seconds: 90 }],
      [{ created_at: "2026-08-15T11:00:00Z", status: "BOOKED", start_time: "2026-08-17T04:30:00Z" }],
      [{ created_at: "2026-08-15T09:00:00Z", content: "whatsapp_reminder_24h" }]
    );
    expect(feed.map((e) => e.type)).toEqual(["appointment_booked", "conversation", "reminder"]);
    expect(feed[0].status).toBe("ok");
  });

  it("surfaces a stamped owner-summary failure as its own honest event", () => {
    const feed = mergeActivityFeed(
      [
        {
          started_at: "2026-08-15T11:19:58Z",
          status: "SUMMARIZED",
          duration_seconds: 150,
          intent: "service",
          audio_metadata: { summaryNotification: { sent: false, reason: "http_401" } },
        },
      ],
      [],
      []
    );
    const summaryEvent = feed.find((e) => e.type === "summary_notification")!;
    expect(summaryEvent.label).toBe("Owner summary not sent (http_401)");
    expect(summaryEvent.status).toBe("warn");
  });

  it("reports partial booking-notification failure with the failing channels named", () => {
    const feed = mergeActivityFeed(
      [],
      [],
      [
        {
          created_at: "2026-08-15T11:07:00Z",
          content: "appointment_notifications",
          metadata: { outcomes: { "client:whatsapp": "sent", "owner:whatsapp": "failed:http_401", "client:email": "failed:no api key" } },
        },
      ]
    );
    expect(feed[0].label).toBe("Booking notifications: 1 sent, 2 failed");
    expect(feed[0].status).toBe("warn");
    expect(feed[0].detail).toContain("owner:whatsapp: http_401");
  });

  it("REQUESTED appointments are labeled as not-on-calendar, never as confirmed", () => {
    const feed = mergeActivityFeed([], [{ created_at: "2026-08-15T08:00:00Z", status: "REQUESTED", start_time: "2026-08-18T05:00:00Z" }], []);
    expect(feed[0].label).toBe("Appointment requested (not on calendar)");
    expect(feed[0].status).toBe("warn");
  });

  it("produces an empty feed from empty sources — no invented rows", () => {
    expect(mergeActivityFeed([], [], [])).toEqual([]);
  });
});
