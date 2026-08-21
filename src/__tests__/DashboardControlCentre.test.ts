/**
 * The single-page control centre's aggregation layer (2026-08-21).
 *
 * Every assertion here defends one honesty rule the owner-facing page makes:
 * a range means a real window, a language split never invents a language, a
 * trend never hides empty days, WhatsApp activity is four DISTINCT things
 * rather than one ambiguous total, "sent" means only that a provider
 * accepted the message, simulated sends are never counted as real, and a
 * blocker appears only when persisted evidence supports it.
 */
import {
  resolveRangeWindow,
  isDashboardRange,
  computeLanguageSplit,
  computeDailySeries,
  computeWhatsAppBreakdown,
  computeEmailBreakdown,
  deriveBlockers,
  bookingConversionPercent,
  computeQualificationFunnel,
} from "@/shared/lib/dashboardLive";
import { isConfiguredValue } from "@/shared/lib/providerHealth";
import { isPlaceholderCredential } from "@/shared/lib/security";

const NOW = Date.parse("2026-08-21T12:00:00.000Z");

describe("resolveRangeWindow", () => {
  it("accepts only the four supported ranges", () => {
    for (const r of ["today", "7d", "30d", "90d"]) expect(isDashboardRange(r)).toBe(true);
    for (const r of ["1y", "", null, undefined, "7D "]) expect(isDashboardRange(r as string)).toBe(false);
  });

  it("uses the owner's own local midnight for 'today'", () => {
    const ownerMidnight = "2026-08-21T18:30:00.000Z"; // e.g. IST midnight is 18:30Z the previous day
    const w = resolveRangeWindow("today", Date.parse("2026-08-21T20:00:00.000Z"), ownerMidnight);
    expect(w.sinceIso).toBe(ownerMidnight);
    expect(w.days).toBe(1);
  });

  it("falls back to UTC midnight when the supplied 'today' is missing or implausible", () => {
    const utcMidnight = "2026-08-21T00:00:00.000Z";
    expect(resolveRangeWindow("today", NOW, null).sinceIso).toBe(utcMidnight);
    // A timestamp older than 48h, or in the future, is not trusted.
    expect(resolveRangeWindow("today", NOW, "2026-08-01T00:00:00.000Z").sinceIso).toBe(utcMidnight);
    expect(resolveRangeWindow("today", NOW, "2027-01-01T00:00:00.000Z").sinceIso).toBe(utcMidnight);
  });

  it("spans exactly the requested number of days for the multi-day ranges", () => {
    expect(resolveRangeWindow("7d", NOW).days).toBe(7);
    expect(resolveRangeWindow("30d", NOW).days).toBe(30);
    expect(resolveRangeWindow("90d", NOW).days).toBe(90);
  });

  it("anchors multi-day windows to whole days ENDING TODAY, so today is never excluded", () => {
    // Regression: a rolling now-minus-N×24h window starts mid-day, which put
    // the last bucket on YESTERDAY and dropped every call made today —
    // observed against real data (4 of 501 conversations vanished).
    const w = resolveRangeWindow("7d", NOW);
    expect(w.sinceIso).toBe("2026-08-15T00:00:00.000Z"); // 6 whole days before 2026-08-21
    const buckets = computeDailySeries([{ started_at: "2026-08-21T09:00:00.000Z", duration_seconds: 60 }], w, NOW);
    expect(buckets).toHaveLength(7);
    expect(buckets[buckets.length - 1].key).toBe("2026-08-21"); // today IS the last bucket
    expect(buckets[buckets.length - 1].calls).toBe(1); // and today's call lands in it
  });
});

describe("computeLanguageSplit", () => {
  it("counts each persisted language and never invents one for legacy null rows", () => {
    const split = computeLanguageSplit([
      { language: "en" }, { language: "en" }, { language: "ta" },
      { language: null }, { language: undefined }, { language: "  " },
    ]);
    expect(split).toEqual({ en: 2, ta: 1, unspecified: 3 });
    // The specific defect this guards: folding unknown rows into English.
    expect(split.en).toBe(2);
  });

  it("returns an empty map for no rows rather than zeroed language keys", () => {
    expect(computeLanguageSplit([])).toEqual({});
  });
});

describe("computeDailySeries", () => {
  const window7 = resolveRangeWindow("7d", NOW);

  it("emits one bucket per day INCLUDING days with no activity", () => {
    const series = computeDailySeries([{ started_at: "2026-08-20T09:00:00.000Z", duration_seconds: 120 }], window7, NOW);
    expect(series).toHaveLength(7);
    const active = series.find((p) => p.key === "2026-08-20");
    expect(active).toEqual({ key: "2026-08-20", calls: 1, minutes: 2 });
    // Every other day is a real zero, not a missing point.
    expect(series.filter((p) => p.calls === 0)).toHaveLength(6);
  });

  it("sums calls and minutes within a day and ignores rows outside the window", () => {
    const series = computeDailySeries(
      [
        { started_at: "2026-08-20T09:00:00.000Z", duration_seconds: 90 },
        { started_at: "2026-08-20T11:00:00.000Z", duration_seconds: 30 },
        { started_at: "2020-01-01T00:00:00.000Z", duration_seconds: 6000 }, // far outside
      ],
      window7,
      NOW
    );
    const day = series.find((p) => p.key === "2026-08-20")!;
    expect(day.calls).toBe(2);
    expect(day.minutes).toBe(2); // 120s
    expect(series.reduce((s, p) => s + p.calls, 0)).toBe(2); // the stray row is not counted
  });

  it("a single-day window buckets every row it was given, labelled with the OWNER's date", () => {
    // Regression seen live for an IST owner (UTC+5:30): their local day
    // starts 18:30Z the previous date, so bucketing by UTC date labelled the
    // bar "2026-08-20" AND counted 0 calls, directly contradicting the "4
    // conversations" KPI beside it.
    const ownerMidnight = "2026-08-20T18:30:00.000Z"; // = 2026-08-21 00:00 IST
    const w = resolveRangeWindow("today", Date.parse("2026-08-21T09:00:00.000Z"), ownerMidnight);
    const series = computeDailySeries(
      [
        { started_at: "2026-08-20T19:00:00.000Z", duration_seconds: 60 }, // early local day, previous UTC date
        { started_at: "2026-08-21T04:00:00.000Z", duration_seconds: 120 }, // later same local day
      ],
      w,
      Date.parse("2026-08-21T09:00:00.000Z")
    );
    expect(series).toHaveLength(1);
    expect(series[0].key).toBe("2026-08-21"); // the owner's date, not the UTC date of their midnight
    expect(series[0].calls).toBe(2); // no row dropped across the UTC date boundary
    expect(series[0].minutes).toBe(3);
  });

  it("a single-day bucket never contradicts the range KPI count", () => {
    const w = resolveRangeWindow("today", NOW, "2026-08-20T18:30:00.000Z");
    const rows = [
      { started_at: "2026-08-20T19:00:00.000Z", duration_seconds: 30 },
      { started_at: "2026-08-21T02:00:00.000Z", duration_seconds: 30 },
      { started_at: "2026-08-21T08:00:00.000Z", duration_seconds: 30 },
    ];
    const series = computeDailySeries(rows, w, NOW);
    expect(series.reduce((s, p) => s + p.calls, 0)).toBe(rows.length);
  });

  it("treats a null duration as zero minutes without dropping the call", () => {
    const series = computeDailySeries([{ started_at: "2026-08-19T10:00:00.000Z", duration_seconds: null }], window7, NOW);
    const day = series.find((p) => p.key === "2026-08-19")!;
    expect(day.calls).toBe(1);
    expect(day.minutes).toBe(0);
  });
});

describe("computeWhatsAppBreakdown", () => {
  it("separates the four categories instead of one ambiguous total", () => {
    const out = computeWhatsAppBreakdown(
      [
        { channel: "whatsapp" },
        { channel: "voice", audio_metadata: { summaryNotification: { sent: true } } },
        { channel: "voice", audio_metadata: { summaryNotification: { sent: false } } },
      ],
      [
        {
          created_at: "2026-08-20T00:00:00.000Z",
          content: "appointment_notifications",
          metadata: { outcomes: { "client:whatsapp": "failed:http_401", "owner:whatsapp": "sent", "client:email": "sent" } },
        },
        { created_at: "2026-08-20T00:00:00.000Z", content: "whatsapp_reminder_24h", metadata: {} },
      ]
    );
    expect(out.qualificationConversations).toBe(1);
    expect(out.ownerSummaries).toEqual({ sent: 1, failed: 1 });
    expect(out.appointmentConfirmations).toEqual({ sent: 1, failed: 1 });
    expect(out.reminders.sent).toBe(1);
  });

  it("never counts an email outcome as WhatsApp activity", () => {
    const out = computeWhatsAppBreakdown(
      [],
      [{ created_at: "x", content: "appointment_notifications", metadata: { outcomes: { "client:email": "sent", "owner:email": "sent" } } }]
    );
    expect(out.appointmentConfirmations).toEqual({ sent: 0, failed: 0 });
  });

  it("reports genuine zeros for a company with no WhatsApp activity at all", () => {
    expect(computeWhatsAppBreakdown([], [])).toEqual({
      qualificationConversations: 0,
      appointmentConfirmations: { sent: 0, failed: 0 },
      ownerSummaries: { sent: 0, failed: 0 },
      reminders: { sent: 0 },
    });
  });
});

describe("computeEmailBreakdown", () => {
  it("counts a simulated send apart from a real provider acceptance", () => {
    const out = computeEmailBreakdown([
      { status: "SENT", provider_message_id: "sim_msg_1785816387747", template_name: "high_value_lead_alert" },
      { status: "SENT", provider_message_id: "re_realid", template_name: "client_appointment_confirmation" },
      { status: "FAILED", provider_message_id: null, template_name: "owner_appointment_confirmation", },
    ]);
    // The exact defect this guards: a simulated row reading as delivered.
    expect(out.simulated).toBe(1);
    expect(out.providerAccepted).toBe(1);
    expect(out.failed).toBe(1);
    expect(out.clientConfirmations).toBe(1);
    expect(out.adminConfirmations).toBe(1);
  });

  it("is all zeros for no rows", () => {
    expect(computeEmailBreakdown([])).toEqual({
      providerAccepted: 0, failed: 0, simulated: 0, clientConfirmations: 0, adminConfirmations: 0,
    });
  });
});

describe("deriveBlockers", () => {
  const healthy = { database: "ok", whatsapp: "configured", whatsappTemplate: "configured", email: "configured", calendar: "configured", tts: "available" };
  const noWhatsApp = { qualificationConversations: 0, appointmentConfirmations: { sent: 0, failed: 0 }, ownerSummaries: { sent: 0, failed: 0 }, reminders: { sent: 0 } };
  const noEmail = { providerAccepted: 0, failed: 0, simulated: 0, clientConfirmations: 0, adminConfirmations: 0 };

  it("raises nothing when every provider is healthy and nothing has failed", () => {
    expect(deriveBlockers(healthy, noWhatsApp, noEmail)).toEqual([]);
  });

  it("raises a WhatsApp blocker from RECORDED failures, with a problem, status and action", () => {
    const blockers = deriveBlockers(healthy, { ...noWhatsApp, ownerSummaries: { sent: 0, failed: 3 } }, noEmail);
    const wa = blockers.find((b) => b.id === "whatsapp")!;
    expect(wa.status).toContain("3");
    expect(wa.problem).toBeTruthy();
    expect(wa.action).toBeTruthy();
    expect(wa.severity).toBe("blocked");
  });

  it("flags a missing template as degraded, not blocked", () => {
    const blockers = deriveBlockers({ ...healthy, whatsappTemplate: "not configured" }, noWhatsApp, noEmail);
    expect(blockers.find((b) => b.id === "whatsapp-template")!.severity).toBe("degraded");
  });

  it("flags historical simulated email separately from an email outage", () => {
    const blockers = deriveBlockers(healthy, noWhatsApp, { ...noEmail, simulated: 4 });
    expect(blockers.map((b) => b.id)).toContain("email-simulated");
    expect(blockers.find((b) => b.id === "email-simulated")!.status).toContain("4");
  });

  it("raises TTS only when the probe actually says unavailable", () => {
    expect(deriveBlockers({ ...healthy, tts: "available" }, noWhatsApp, noEmail).find((b) => b.id === "tts")).toBeUndefined();
    expect(
      deriveBlockers({ ...healthy, tts: "unavailable (provider/billing)" }, noWhatsApp, noEmail).find((b) => b.id === "tts")
    ).toBeDefined();
  });

  it("never leaks provider identifiers, endpoints or credential names into owner-facing text", () => {
    const blockers = deriveBlockers(
      { database: "degraded", whatsapp: "not configured", whatsappTemplate: "not configured", email: "not configured", calendar: "not configured", tts: "unavailable (provider/billing)" },
      { ...noWhatsApp, ownerSummaries: { sent: 0, failed: 2 } },
      { ...noEmail, failed: 2, simulated: 1 }
    );
    expect(blockers.length).toBeGreaterThan(0);
    const text = blockers.map((b) => `${b.problem} ${b.status} ${b.action}`).join(" ");
    expect(text).not.toMatch(/api[_-]?key|secret|token=|bearer|sk-|re_[A-Za-z0-9]{10}|supabase\.co|graph\.facebook/i);
  });
});

describe("provider-health honesty: one definition of a real credential", () => {
  /**
   * Regression for a defect seen on the LIVE dashboard: the health pills used
   * a laxer placeholder test than the adapters that actually send, so the
   * page displayed "Email: configured" while every send failed closed with
   * "Email provider not configured" and the booking audit recorded exactly
   * that. A health pill must never contradict the runtime.
   */
  it("agrees with the send path's placeholder test for every value shape", () => {
    const shapes = [
      "your-key-here",
      "placeholder",
      "example-key",
      "xxxx",
      "changeme",
      "sample",
      "dummy",
      "replace",
      "todo",
      "test",
      "demo",
      // The template shape that caused the live mismatch: lowercase words
      // joined by separators, which reads like a real key but is not one.
      "resend-api-key",
      "my_email_provider_key",
      "",
      undefined,
      // ...and genuine-looking credentials, which must stay "configured".
      "re_8Kd93jXmQp02LasdfQ",
      "sk-proj-9dK2mfoQ",
      "b8c69ca9-64a7-43b1-9020-9f820bd6eda7",
    ];
    for (const value of shapes) {
      expect(isConfiguredValue(value)).toBe(!isPlaceholderCredential(value));
    }
  });

  it("treats a lowercase-words placeholder as NOT configured", () => {
    expect(isConfiguredValue("resend-api-key")).toBe(false);
    expect(isConfiguredValue("changeme")).toBe(false);
  });

  it("still treats a realistic key as configured", () => {
    expect(isConfiguredValue("re_8Kd93jXmQp02LasdfQ")).toBe(true);
    expect(isConfiguredValue("b8c69ca9-64a7-43b1-9020-9f820bd6eda7")).toBe(true);
  });
});

describe("conversion + funnel honesty (unchanged rules, re-pinned for the single page)", () => {
  it("returns null — never 0% — with no completed qualifications", () => {
    expect(bookingConversionPercent(0, 0)).toBeNull();
    expect(bookingConversionPercent(5, 0)).toBeNull();
  });

  it("counts only Q1..Q6 and ignores legacy Q8/Q15 residue", () => {
    const funnel = computeQualificationFunnel([
      { qualification_notes: "Q1 [YES] (t): Yes\nQ2 [NO] (t): No" },
      { qualification_notes: "Q1 [YES] (t): Yes\nQ3 [MAYBE] (t): Maybe\nQ8 [MAYBE] (t): Maybe\nQ15 [YES] (t): Yes" },
    ]);
    expect(funnel.q1).toBe(2);
    expect(funnel.q2).toBe(1);
    expect(funnel.q3).toBe(1);
    expect(funnel.q6).toBe(0);
    expect(funnel.completed).toBe(0);
    expect(Object.keys(funnel)).toEqual(["q1", "q2", "q3", "q4", "q5", "q6", "completed"]);
  });
});
