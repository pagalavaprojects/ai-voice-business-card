/**
 * Proves the WhatsApp adapter is genuinely THIN: it never classifies,
 * never sequences, never persists directly — every one of those still
 * flows through the real get_next_qualification_question tool (the exact
 * ToolRegistry instance, not a mock of it), the same one the Vapi webhook
 * calls for voice, and the SAME six-question authoritative script (2026-
 * 08-13 revision — English-only, no language-selection step: the first
 * inbound message goes straight into question 1).
 */
import { ToolRegistry } from "@/core/application/tools/ToolRegistry";
import { WhatsAppQualificationChannel, WhatsAppInboundMessage } from "@/core/application/services/WhatsAppQualificationChannel";
import { IConversationRepository } from "@/core/domain/repositories/IConversationRepository";
import { Conversation } from "@/core/domain/models/types";
import { getAuthoredQuestion } from "@/features/voice/lib/qualificationScript";

function buildConversationRepo() {
  const conversations = new Map<string, Conversation>();
  let nextId = 0;
  const repo: IConversationRepository = {
    createConversation: async () => {
      throw new Error("not used by WhatsApp");
    },
    getConversationById: async (id) => conversations.get(id) ?? null,
    getOrCreateConversationByVapiCallId: async () => {
      throw new Error("not used by WhatsApp");
    },
    getOrCreateConversationByWhatsAppSender: async (companyId, employeeId, waId, language) => {
      for (const c of conversations.values()) if (c.whatsapp_wa_id === waId) return c;
      const id = `conv-${++nextId}`;
      const conv = {
        id,
        company_id: companyId,
        employee_id: employeeId,
        channel: "whatsapp",
        whatsapp_wa_id: waId,
        whatsapp_pending_question: null,
        language: language ?? null,
        status: "ACTIVE",
        started_at: new Date().toISOString(),
        tools_called: [],
        audio_metadata: {},
      } as unknown as Conversation;
      conversations.set(id, conv);
      return conv;
    },
    setWhatsAppPendingQuestion: async (id, q) => {
      const c = conversations.get(id)!;
      c.whatsapp_pending_question = q;
      return c;
    },
    setConversationLanguage: async (id, lang) => {
      const c = conversations.get(id)!;
      c.language = lang;
      return c;
    },
    appendToolCalled: async (id) => conversations.get(id)!,
    addMessage: async () => {
      throw new Error("not used by WhatsApp");
    },
    getMessages: async () => [],
    endConversation: async (id) => conversations.get(id)!,
  };
  return { repo, conversations };
}

function buildNotifier() {
  const sent: Array<{ to: string; body: string }> = [];
  return {
    sent,
    notifier: {
      isConfigured: () => true,
      send: async (to: string, body: string) => {
        sent.push({ to, body });
        return { sent: true };
      },
    },
  };
}

/** The exact same in-memory lead store shape as QualificationSequencing's
 * buildLive() — proves the WhatsApp path exercises the SAME auto-create-
 * lead-by-conversationId fix, not a reimplementation of it. */
function buildCrmRepo() {
  const leads = new Map<string, { id: string; conversation_id: string; qualification_notes: string; lead_temperature: string | null }>();
  let nextId = 0;
  return {
    leads,
    crmRepo: {
      getLeadByConversationId: jest.fn(async (conversationId: string) => {
        for (const lead of leads.values()) if (lead.conversation_id === conversationId) return lead;
        return null;
      }),
      createLead: jest.fn(async (data: { conversation_id?: string }) => {
        const id = `lead-${++nextId}`;
        const lead = { id, conversation_id: data.conversation_id ?? "", qualification_notes: "", lead_temperature: null };
        leads.set(id, lead);
        return lead;
      }),
      getLeadById: jest.fn(async (id: string) => leads.get(id) ?? null),
      updateLeadQualification: jest.fn(async (id: string, patch: Record<string, unknown>) => {
        const lead = leads.get(id)!;
        Object.assign(lead, patch);
        return lead;
      }),
    },
  };
}

function buildChannel() {
  const { repo: conversationRepo, conversations } = buildConversationRepo();
  const { notifier, sent } = buildNotifier();
  const { crmRepo, leads } = buildCrmRepo();
  const toolRegistry = new ToolRegistry(crmRepo as never, {} as never, {} as never);
  const channel = new WhatsAppQualificationChannel(toolRegistry, conversationRepo, notifier);
  return { channel, conversations, sent, leads };
}

const BASE = { companyId: "c1", employeeId: "e1", waId: "919999999999" };
const msg = (text: string, overrides: Partial<WhatsAppInboundMessage> = {}): WhatsAppInboundMessage => ({ ...BASE, text, ...overrides });

describe("WhatsAppQualificationChannel — first contact goes straight to question 1", () => {
  it("a brand-new sender's first message is answered with Q1 + guidance immediately — no language prompt, no generic greeting", async () => {
    const { channel, sent, conversations } = buildChannel();
    await channel.handleInboundMessage(msg("Hi"));
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toBe(getAuthoredQuestion(1)!.question + "\n\nPlease answer with Yes, No, or Maybe.");
    for (const forbidden of ["How can I help", "How may I help", "What can I help", "Tamil", "English"]) {
      expect(sent[0].body).not.toContain(forbidden);
    }
    const [conv] = conversations.values();
    expect(conv.whatsapp_pending_question).toBe(1);
  });

  it("works identically no matter what the visitor's opening message says — no language gate to satisfy first", async () => {
    for (const opener of ["Hi", "Hello", "vanakkam", "hey there, tell me more", ""]) {
      const { channel, sent } = buildChannel();
      await channel.handleInboundMessage(msg(opener || " "));
      expect(sent[0].body).toBe(getAuthoredQuestion(1)!.question + "\n\nPlease answer with Yes, No, or Maybe.");
    }
  });
});

describe("WhatsAppQualificationChannel — conversation identity", () => {
  it("a new sender creates exactly one conversation", async () => {
    const { channel, conversations } = buildChannel();
    await channel.handleInboundMessage(msg("Hi"));
    await channel.handleInboundMessage(msg("Yes"));
    expect(conversations.size).toBe(1);
  });

  it("an existing sender's second message reuses the SAME conversation — state persists across separate calls, exactly like separate webhook requests", async () => {
    const { channel, conversations } = buildChannel();
    await channel.handleInboundMessage(msg("Hi"));
    expect([...conversations.values()][0].whatsapp_pending_question).toBe(1);

    // A SECOND, fully independent call — simulating a fresh webhook request
    // with no shared in-memory state — must continue from Q1, not restart.
    await channel.handleInboundMessage(msg("Yes"));
    expect(conversations.size).toBe(1);
    expect([...conversations.values()][0].whatsapp_pending_question).toBe(2);
  });
});

describe("WhatsAppQualificationChannel — answer matrix (reuses the real classifier/sequencer)", () => {
  it.each([
    ["Yes", "YES"],
    ["No", "NO"],
    ["Maybe", "MAYBE"],
  ])('"%s" is classified %s, persisted, Live Transcript data available, and Q2 is sent', async (reply, cls) => {
    const { channel, sent, leads } = buildChannel();
    await channel.handleInboundMessage(msg("Hi"));
    sent.length = 0; // only inspect what happens for the actual answer
    await channel.handleInboundMessage(msg(reply));

    expect(sent).toHaveLength(1);
    expect(sent[0].body).toBe(getAuthoredQuestion(2)!.question + "\n\nPlease answer with Yes, No, or Maybe.");
    const [lead] = leads.values();
    expect(lead.qualification_notes).toContain(`Q1 [${cls}]`);
  });

  it('an invalid reply ("I think so") does not persist, does not advance, and repeats the guidance', async () => {
    const { channel, sent, leads } = buildChannel();
    await channel.handleInboundMessage(msg("Hi"));
    sent.length = 0;
    await channel.handleInboundMessage(msg("I think so"));

    expect(sent).toHaveLength(1);
    expect(sent[0].body).toBe("Please answer with Yes, No, or Maybe.");
    // Classification fails BEFORE lead resolution even runs (see
    // ToolRegistry's early reprompt return) — no lead exists yet at all,
    // not merely one with empty notes. That IS the "no persistence"
    // guarantee, proven at its strongest.
    expect(leads.size).toBe(0);

    // The visitor can still answer normally afterward.
    await channel.handleInboundMessage(msg("Yes"));
    expect(leads.size).toBe(1);
    expect([...leads.values()][0].qualification_notes).toContain("Q1 [YES]");
  });
});

describe("WhatsAppQualificationChannel — qualification never computes or persists lead_temperature through this channel", () => {
  // Root cause this guards against regressing: qualification completion
  // and lead scoring are deliberately separate concerns (2026-08-13
  // decision) — this tool must never gate or auto-score through WhatsApp,
  // same as through voice.
  it("walking all six questions never sets lead_temperature", async () => {
    const { channel, leads } = buildChannel();
    await channel.handleInboundMessage(msg("Hi"));
    for (const reply of ["Yes", "Yes", "Yes", "Yes", "Yes"]) {
      await channel.handleInboundMessage(msg(reply));
    }
    const [lead] = leads.values();
    expect(lead.lead_temperature).toBeNull();
  });
});

describe("WhatsAppQualificationChannel — exactly six questions, no old Q7+ fragments reachable", () => {
  it("walking Q1 through Q5 sends Q6 (the calendar-consent question) next, never a seventh question", async () => {
    const { channel, sent, conversations } = buildChannel();
    await channel.handleInboundMessage(msg("Hi"));
    for (let i = 0; i < 4; i++) {
      await channel.handleInboundMessage(msg("Yes"));
    }
    sent.length = 0;
    await channel.handleInboundMessage(msg("Yes")); // answers Q5

    expect(sent[0].body).toContain(getAuthoredQuestion(6)!.question);
    expect(sent[0].body).toContain("Shall I show you our calendar now");
    expect([...conversations.values()][0].whatsapp_pending_question).toBe(6);
  });
});

describe("WhatsAppQualificationChannel — completion and booking handoff (reuses existing rules, invents nothing)", () => {
  it("Q6 completes the questionnaire, sends a completion message with the booking link when provided, and clears the pending question", async () => {
    const { channel, sent, conversations } = buildChannel();
    await channel.handleInboundMessage(msg("Hi"));
    for (let i = 0; i < 5; i++) await channel.handleInboundMessage(msg("Yes"));
    expect([...conversations.values()][0].whatsapp_pending_question).toBe(6);
    sent.length = 0;
    await channel.handleInboundMessage(msg("Yes", { bookingUrl: "https://maylaanai.com/c/founder" })); // answers Q6
    expect(sent[0].body).toContain("complete");
    expect(sent[0].body).toContain("https://maylaanai.com/c/founder");
    expect([...conversations.values()][0].whatsapp_pending_question).toBeNull();
    // No second booking engine: WhatsApp hands off to the existing web
    // flow rather than claiming a booking itself.
    expect(sent[0].body).not.toMatch(/confirmed|booked/i);
  });

  it("never fabricates a booking link when the caller doesn't supply one", async () => {
    const { channel, sent } = buildChannel();
    await channel.handleInboundMessage(msg("Hi"));
    for (let i = 0; i < 5; i++) await channel.handleInboundMessage(msg("Yes"));
    sent.length = 0;
    await channel.handleInboundMessage(msg("Yes")); // answers Q6, no bookingUrl supplied
    expect(sent[0].body).not.toMatch(/https?:\/\//);
  });

  it("does not send the voice-only 'Please Click to Continue' wording — WhatsApp uses its own channel-appropriate completion text", async () => {
    const { channel, sent } = buildChannel();
    await channel.handleInboundMessage(msg("Hi"));
    for (let i = 0; i < 5; i++) await channel.handleInboundMessage(msg("Yes"));
    sent.length = 0;
    await channel.handleInboundMessage(msg("Yes")); // answers Q6
    expect(sent[0].body).not.toContain("Please Click to Continue");
  });
});
