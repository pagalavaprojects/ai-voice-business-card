/**
 * Proves the WhatsApp adapter is genuinely THIN: it never classifies,
 * never sequences, never persists directly — every one of those still
 * flows through the real get_next_qualification_question tool (the exact
 * ToolRegistry instance, not a mock of it), the same one the Vapi webhook
 * calls for voice. What's tested here is only what's new for this
 * channel: language selection, pending-question tracking across separate
 * (stateless) calls, and that invalid/valid answers behave identically to
 * the already-tested voice contract.
 */
import { ToolRegistry } from "@/core/application/tools/ToolRegistry";
import { LeadTemperature } from "@/core/domain/models/types";
import { WhatsAppQualificationChannel, WhatsAppInboundMessage } from "@/core/application/services/WhatsAppQualificationChannel";
import { IConversationRepository } from "@/core/domain/repositories/IConversationRepository";
import { Conversation } from "@/core/domain/models/types";
import { getAuthoredQuestionFor } from "@/features/voice/lib/qualificationScript";

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
function buildCrmRepo(temperature: LeadTemperature | null = null) {
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
        const lead = { id, conversation_id: data.conversation_id ?? "", qualification_notes: "", lead_temperature: temperature };
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

function buildChannel(temperature: LeadTemperature | null = null) {
  const { repo: conversationRepo, conversations } = buildConversationRepo();
  const { notifier, sent } = buildNotifier();
  const { crmRepo, leads } = buildCrmRepo(temperature);
  const toolRegistry = new ToolRegistry(crmRepo as never, {} as never, {} as never);
  const channel = new WhatsAppQualificationChannel(toolRegistry, conversationRepo, notifier);
  return { channel, conversations, sent, leads };
}

const BASE = { companyId: "c1", employeeId: "e1", waId: "919999999999" };
const msg = (text: string, overrides: Partial<WhatsAppInboundMessage> = {}): WhatsAppInboundMessage => ({ ...BASE, text, ...overrides });

describe("WhatsAppQualificationChannel — language selection", () => {
  it("a brand-new sender is sent the language prompt and no qualification question yet", async () => {
    const { channel, sent, conversations } = buildChannel();
    await channel.handleInboundMessage(msg("Hi"));
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toContain("Tamil");
    const [conv] = conversations.values();
    expect(conv.language).toBeNull();
    expect(conv.whatsapp_pending_question).toBeNull();
  });

  it("selecting Tamil persists the language and immediately sends Q1 + guidance in Tamil", async () => {
    const { channel, sent, conversations } = buildChannel();
    await channel.handleInboundMessage(msg("Hi"));
    await channel.handleInboundMessage(msg("தமிழ்"));
    expect(sent).toHaveLength(2);
    expect(sent[1].body).toBe(getAuthoredQuestionFor("ta", 1)!.question + "\n\nஆம், இல்லை அல்லது இருந்தாலும் என பதிலளிக்கவும்.");
    const [conv] = conversations.values();
    expect(conv.language).toBe("ta");
    expect(conv.whatsapp_pending_question).toBe(1);
  });

  it("selecting English persists the language and sends the authored English Q1 + guidance", async () => {
    const { channel, sent, conversations } = buildChannel();
    await channel.handleInboundMessage(msg("Hello"));
    await channel.handleInboundMessage(msg("English"));
    expect(sent[1].body).toBe(getAuthoredQuestionFor("en", 1)!.question + "\n\nPlease answer with Yes, No, or Maybe.");
    expect([...conversations.values()][0].language).toBe("en");
  });

  it("an unrecognized reply re-sends the language prompt rather than guessing", async () => {
    const { channel, sent } = buildChannel();
    await channel.handleInboundMessage(msg("Hi"));
    await channel.handleInboundMessage(msg("what is this"));
    expect(sent).toHaveLength(2);
    expect(sent[1].body).toContain("Tamil");
  });
});

describe("WhatsAppQualificationChannel — conversation identity", () => {
  it("a new sender creates exactly one conversation", async () => {
    const { channel, conversations } = buildChannel();
    await channel.handleInboundMessage(msg("Hi"));
    await channel.handleInboundMessage(msg("Hi again"));
    expect(conversations.size).toBe(1);
  });

  it("an existing sender's second message reuses the SAME conversation — state persists across separate calls, exactly like separate webhook requests", async () => {
    const { channel, conversations } = buildChannel(LeadTemperature.HOT);
    await channel.handleInboundMessage(msg("Hi"));
    await channel.handleInboundMessage(msg("English"));
    expect(conversations.size).toBe(1);
    const [conv] = conversations.values();
    expect(conv.whatsapp_pending_question).toBe(1);

    // A THIRD, fully independent call — simulating a fresh webhook request
    // with no shared in-memory state — must continue from Q1, not restart.
    await channel.handleInboundMessage(msg("Yes"));
    expect(conversations.size).toBe(1);
    expect([...conversations.values()][0].whatsapp_pending_question).toBe(2);
  });
});

describe("WhatsAppQualificationChannel — English answer matrix (reuses the real classifier/sequencer)", () => {
  it.each([
    ["Yes", "YES"],
    ["No", "NO"],
    ["Maybe", "MAYBE"],
  ])('"%s" is classified %s, persisted, Live Transcript data available, and Q2 is sent', async (reply, cls) => {
    const { channel, sent, leads } = buildChannel(LeadTemperature.HOT);
    await channel.handleInboundMessage(msg("Hi"));
    await channel.handleInboundMessage(msg("English"));
    sent.length = 0; // only inspect what happens for the actual answer
    await channel.handleInboundMessage(msg(reply));

    expect(sent).toHaveLength(1);
    expect(sent[0].body).toBe(getAuthoredQuestionFor("en", 2)!.question + "\n\nPlease answer with Yes, No, or Maybe.");
    const [lead] = leads.values();
    expect(lead.qualification_notes).toContain(`Q1 [${cls}]`);
  });

  it('an invalid English reply ("I think so") does not persist, does not advance, and repeats the guidance', async () => {
    const { channel, sent, leads } = buildChannel(LeadTemperature.HOT);
    await channel.handleInboundMessage(msg("Hi"));
    await channel.handleInboundMessage(msg("English"));
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

describe("WhatsAppQualificationChannel — Tamil answer matrix", () => {
  it.each([
    ["ஆம்", "YES"],
    ["இல்லை", "NO"],
    ["இருந்தாலும்", "MAYBE"],
  ])('"%s" is classified %s and Q2 is sent in Tamil', async (reply, cls) => {
    const { channel, sent, leads } = buildChannel(LeadTemperature.HOT);
    await channel.handleInboundMessage(msg("வணக்கம்"));
    await channel.handleInboundMessage(msg("தமிழ்"));
    sent.length = 0;
    await channel.handleInboundMessage(msg(reply));

    expect(sent[0].body).toBe(getAuthoredQuestionFor("ta", 2)!.question + "\n\nஆம், இல்லை அல்லது இருந்தாலும் என பதிலளிக்கவும்.");
    const [lead] = leads.values();
    expect(lead.qualification_notes).toContain(`Q1 [${cls}]`);
  });

  it("an invalid Tamil reply does not advance, repeats the Tamil guidance, and creates no lead", async () => {
    const { channel, sent, leads } = buildChannel(LeadTemperature.HOT);
    await channel.handleInboundMessage(msg("வணக்கம்"));
    await channel.handleInboundMessage(msg("தமிழ்"));
    sent.length = 0;
    await channel.handleInboundMessage(msg("ஆம், இருக்கிறது")); // sentence, not the closed word

    expect(sent[0].body).toBe("ஆம், இல்லை அல்லது இருந்தாலும் என பதிலளிக்கவும்.");
    expect(leads.size).toBe(0);
  });
});

describe("WhatsAppQualificationChannel — routing and completion (reuses existing rules, invents nothing)", () => {
  it("COLD routing is unaffected by channel: Q7 -> Q16 through WhatsApp exactly as through voice", async () => {
    const { channel, sent, conversations } = buildChannel(LeadTemperature.COLD);
    await channel.handleInboundMessage(msg("Hi"));
    await channel.handleInboundMessage(msg("English"));
    for (let q = 1; q <= 6; q++) {
      await channel.handleInboundMessage(msg("Yes"));
    }
    sent.length = 0;
    await channel.handleInboundMessage(msg("Yes")); // answers Q7
    expect(sent[0].body).toContain(getAuthoredQuestionFor("en", 16)!.question);
    expect([...conversations.values()][0].whatsapp_pending_question).toBe(16);
  });

  it("Q17 completes the questionnaire, sends a completion message with the booking link when provided, and clears the pending question", async () => {
    // WARM walks all 16 authored numbers (1-12,14-17); pending starts at 1
    // (Q1 already sent). 15 "Yes" replies advance from Q1-answered through
    // Q16-answered (pending=17); the 16th reply answers Q17 and completes.
    const { channel, sent, conversations } = buildChannel(LeadTemperature.WARM);
    await channel.handleInboundMessage(msg("Hi"));
    await channel.handleInboundMessage(msg("English"));
    for (let q = 0; q < 15; q++) {
      await channel.handleInboundMessage(msg("Yes"));
    }
    expect([...conversations.values()][0].whatsapp_pending_question).toBe(17);
    sent.length = 0;
    await channel.handleInboundMessage(msg("Yes", { bookingUrl: "https://maylaanai.com/c/founder" })); // answers Q17
    expect(sent[0].body).toContain("complete");
    expect(sent[0].body).toContain("https://maylaanai.com/c/founder");
    expect([...conversations.values()][0].whatsapp_pending_question).toBeNull();
  });

  it("never fabricates a booking link when the caller doesn't supply one", async () => {
    const { channel, sent } = buildChannel(LeadTemperature.WARM);
    await channel.handleInboundMessage(msg("Hi"));
    await channel.handleInboundMessage(msg("English"));
    for (let q = 0; q < 15; q++) await channel.handleInboundMessage(msg("Yes"));
    sent.length = 0;
    await channel.handleInboundMessage(msg("Yes"));
    expect(sent[0].body).not.toMatch(/https?:\/\//);
  });
});
