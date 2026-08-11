/**
 * The server owns the questionnaire (2026-08-10 revision): exact authored
 * order, the Q10→Q11 condition, the deliberate Q13 gap, COLD routing
 * (skip Q8–Q15 but STILL ask Q16–Q17 — a COLD lead always still books),
 * and — closed-ended revision — SERVER-side classification of the raw
 * Tamil reply (only ஆம்/இல்லை/இருந்தாலும் are valid; anything else
 * reprompts without advancing or storing) plus per-question answer
 * recording onto the lead's existing qualification_notes field.
 */
import { ToolRegistry } from "@/core/application/tools/ToolRegistry";
import { LeadTemperature } from "@/core/domain/models/types";
import {
  getAuthoredQuestion,
  TAMIL_ANSWER_GUIDANCE,
  TAMIL_QUALIFICATION_QUESTIONS,
  withAnswerGuidance,
  getAuthoredEnglishQuestion,
  ENGLISH_ANSWER_GUIDANCE,
  ENGLISH_CONTINUE_PROMPT,
  TAMIL_CONTINUE_PROMPT,
} from "@/features/voice/lib/qualificationScript";

function build(temperature: LeadTemperature | null, notes = "") {
  const lead = temperature !== null || notes ? { id: "l1", lead_temperature: temperature, qualification_notes: notes } : null;
  const crmRepo = {
    getLeadById: jest.fn().mockResolvedValue(lead),
    updateLeadQualification: jest.fn().mockResolvedValue({}),
    getLeadByConversationId: jest.fn().mockResolvedValue(null),
    createLead: jest.fn(),
  };
  const registry = new ToolRegistry(crmRepo as never, {} as never, {} as never);
  return { tool: registry.getTool("get_next_qualification_question")!, crmRepo };
}

/** Simulates a REAL live call end-to-end: no test ever hands the model a
 * lead_id (matching production — the closed-ended directive no longer asks
 * for one), only a stable conversationId (exactly what the webhook resolves
 * server-side from the Vapi call). The in-memory store mimics
 * getLeadByConversationId/getLeadById/createLead/updateLeadQualification
 * closely enough to prove the SAME lead is created once and reused for
 * every subsequent answer — the fix for the bug where save_lead could never
 * succeed in time (it requires name/email/phone, which the visitor only
 * gives much later in the booking form) so the model never had a lead_id
 * and every answer silently failed to persist. */
function buildLive() {
  const leads = new Map<string, { id: string; conversation_id: string; qualification_notes: string; lead_temperature: string | null }>();
  let nextId = 0;
  const crmRepo = {
    getLeadByConversationId: jest.fn(async (conversationId: string) => {
      for (const lead of leads.values()) if (lead.conversation_id === conversationId) return lead;
      return null;
    }),
    createLead: jest.fn(async (data: { conversation_id?: string }) => {
      const id = `auto-lead-${++nextId}`;
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
  };
  const registry = new ToolRegistry(crmRepo as never, {} as never, {} as never);
  return { tool: registry.getTool("get_next_qualification_question")!, crmRepo, leads };
}

const TA = { companyId: "c1", employeeId: "e1", language: "ta" as const };
const TA_LIVE = { companyId: "c1", employeeId: "e1", language: "ta" as const, conversationId: "conv-1" };
const EN = { companyId: "c1", employeeId: "e1", language: "en" as const };
const EN_LIVE = { companyId: "c1", employeeId: "e1", language: "en" as const, conversationId: "conv-en-1" };
const q = (n: number) => getAuthoredQuestion(n)!.question;
const qEn = (n: number) => getAuthoredEnglishQuestion(n)!.question;

describe("get_next_qualification_question (closed-ended revision)", () => {
  it("walks Set 1 in exact authored order (0→Q1 … 6→Q7), speaking question+guidance", async () => {
    const { tool } = build(null);
    for (let last = 0; last <= 6; last++) {
      const res = await tool.execute({ last_answered_question: last, user_response: "ஆம்", lead_id: "l1" }, TA);
      expect(res).toMatchObject({
        action: "ask_verbatim",
        question_number: last + 1,
        question: q(last + 1),
        speak: withAnswerGuidance(q(last + 1)),
      });
    }
  });

  it.each([LeadTemperature.HOT, LeadTemperature.WARM])("%s after Q7 → Q8", async (temp) => {
    const { tool } = build(temp);
    const res = await tool.execute({ last_answered_question: 7, user_response: "ஆம்", lead_id: "l1" }, TA);
    expect(res).toMatchObject({ action: "ask_verbatim", question_number: 8, question: q(8) });
  });

  it("COLD after Q7 → Q16 (skips Q8–Q15, still gets calendar consent — never discarded)", async () => {
    const { tool } = build(LeadTemperature.COLD);
    const res = (await tool.execute({ last_answered_question: 7, user_response: "இல்லை", lead_id: "l1" }, TA)) as Record<string, unknown>;
    expect(res).toMatchObject({ action: "ask_verbatim", question_number: 16, question: q(16), speak: withAnswerGuidance(q(16)) });
    expect(String(res.note)).toContain("still be able to book");
  });

  it("Q10 answered இல்லை (NO) skips the conditional Q11 → Q12", async () => {
    const { tool } = build(LeadTemperature.HOT);
    const res = await tool.execute({ last_answered_question: 10, user_response: "இல்லை", lead_id: "l1" }, TA);
    expect(res).toMatchObject({ action: "ask_verbatim", question_number: 12, question: q(12) });
  });

  it.each(["ஆம்", "இருந்தாலும்"])("Q10 answered %s asks the conditional Q11", async (reply) => {
    const { tool } = build(LeadTemperature.HOT);
    const res = await tool.execute({ last_answered_question: 10, user_response: reply, lead_id: "l1" }, TA);
    expect(res).toMatchObject({ action: "ask_verbatim", question_number: 11, question: q(11) });
  });

  it("Q13 is never asked: Q12 → Q14, and 13 is rejected as input", async () => {
    const { tool } = build(LeadTemperature.HOT);
    const after12 = await tool.execute({ last_answered_question: 12, user_response: "ஆம்", lead_id: "l1" }, TA);
    expect(after12).toMatchObject({ action: "ask_verbatim", question_number: 14, question: q(14) });
    const bad = (await tool.execute({ last_answered_question: 13 }, TA)) as { action: string };
    expect(bad.action).toBe("error");
  });

  it("no full walk can ever produce question 13", async () => {
    const { tool } = build(LeadTemperature.HOT);
    const seen: number[] = [];
    let last = 0;
    for (let guard = 0; guard < 20; guard++) {
      const res = (await tool.execute({ last_answered_question: last, user_response: "ஆம்", lead_id: "l1" }, TA)) as Record<string, unknown>;
      if (res.action !== "ask_verbatim") break;
      seen.push(res.question_number as number);
      last = res.question_number as number;
    }
    expect(seen).not.toContain(13);
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17]);
  });

  it("Q14 → Q15 → Q16 → Q17 → complete_proceed_to_booking", async () => {
    const { tool } = build(LeadTemperature.WARM);
    expect(await tool.execute({ last_answered_question: 14, user_response: "ஆம்", lead_id: "l1" }, TA)).toMatchObject({ question_number: 15 });
    expect(await tool.execute({ last_answered_question: 15, user_response: "இல்லை", lead_id: "l1" }, TA)).toMatchObject({ question_number: 16 });
    expect(await tool.execute({ last_answered_question: 16, user_response: "ஆம்", lead_id: "l1" }, TA)).toMatchObject({ question_number: 17 });
    const done = (await tool.execute({ last_answered_question: 17, user_response: "ஆம்", lead_id: "l1" }, TA)) as { action: string };
    expect(done.action).toBe("complete_proceed_to_booking");
  });

  it.each([
    ["ஆம்", "YES", "Yes"],
    ["இல்லை", "NO", "No"],
    ["இருந்தாலும்", "MAYBE", "Maybe"],
  ])("records %s as Qn [%s]: %s — classification derived by the SERVER, English is canonical", async (reply, cls, english) => {
    const { tool, crmRepo } = build(LeadTemperature.HOT, "existing internal note");
    await tool.execute({ last_answered_question: 3, user_response: reply, lead_id: "l1" }, TA);
    expect(crmRepo.updateLeadQualification).toHaveBeenCalledTimes(1);
    const patch = crmRepo.updateLeadQualification.mock.calls[0][1] as { qualification_notes: string };
    expect(patch.qualification_notes).toMatch(new RegExp(`^existing internal note\\nQ3 \\[${cls}\\] \\([0-9T:.Z-]+\\): ${english}$`));
  });

  it("an invalid reply reprompts with the guidance, stays on the SAME question, and stores NOTHING", async () => {
    const { tool, crmRepo } = build(LeadTemperature.HOT);
    for (const invalid of ["ஆம், இருக்கிறது", "எங்களுக்கு ஒரு பிரச்சினை இருக்கிறது", "சரி", "yes we have a problem", ""]) {
      const res = (await tool.execute({ last_answered_question: 3, user_response: invalid, lead_id: "l1" }, TA)) as Record<string, unknown>;
      expect(res.action).toBe("reprompt");
      expect(res.question_number).toBe(3);
      expect(res.speak).toBe(TAMIL_ANSWER_GUIDANCE);
    }
    expect(crmRepo.updateLeadQualification).not.toHaveBeenCalled();
  });

  it("a missing user_response also reprompts rather than advancing on nothing", async () => {
    const { tool, crmRepo } = build(LeadTemperature.HOT);
    const res = (await tool.execute({ last_answered_question: 5, lead_id: "l1" }, TA)) as { action: string };
    expect(res.action).toBe("reprompt");
    expect(crmRepo.updateLeadQualification).not.toHaveBeenCalled();
  });

  it("unknown temperature after Q7 continues to Q8 rather than discarding", async () => {
    const { tool } = build(null);
    const res = await tool.execute({ last_answered_question: 7, user_response: "ஆம்" }, TA);
    expect(res).toMatchObject({ action: "ask_verbatim", question_number: 8 });
  });

  it("sessions in a language the closed-ended flow was never authored for get the freeform action", async () => {
    const { tool } = build(LeadTemperature.HOT);
    for (const language of ["hi", "te", "ml", "kn"]) {
      const res = (await tool.execute({ last_answered_question: 0 }, { ...TA, language })) as { action: string };
      expect(res.action).toBe("freeform");
    }
  });

  it("English sessions get the real closed-ended flow too, not freeform", async () => {
    const { tool } = build(LeadTemperature.HOT);
    const res = (await tool.execute({ last_answered_question: 0 }, { ...TA, language: "en" })) as { action: string };
    expect(res.action).toBe("ask_verbatim");
  });

  it("rejects out-of-range/non-integer inputs", async () => {
    const { tool } = build(null);
    for (const bad of [-1, 18, 3.5]) {
      expect(((await tool.execute({ last_answered_question: bad }, TA)) as { action: string }).action).toBe("error");
    }
  });

  it("the master list has 16 questions, numbered 1-17 with exactly 13 missing", () => {
    const numbers = TAMIL_QUALIFICATION_QUESTIONS.map((x) => x.number);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17]);
  });
});

describe("get_next_qualification_question — lead resolution WITHOUT a model-supplied lead_id (the real live-call shape)", () => {
  // Root cause: save_lead's schema REQUIRES name/email/phone, which the
  // visitor only gives in the booking form — long after (sometimes never,
  // if they abandon) this closed-ended Q&A completes. The model therefore
  // routinely has no lead_id to pass, and every prior version of this tool
  // silently skipped persistence whenever lead_id was absent: the voice
  // loop SOUNDED like it worked (correct classification, correct next
  // question spoken) but Live Transcript stayed empty forever. The fix:
  // resolve the lead from context.conversationId — which the webhook
  // already establishes deterministically from the Vapi call, with zero
  // model involvement — creating a minimal placeholder lead on first use.

  it("auto-creates exactly ONE lead for the conversation and persists Q1's answer, with no lead_id ever supplied", async () => {
    const { tool, crmRepo, leads } = buildLive();
    const res = await tool.execute({ last_answered_question: 1, user_response: "ஆம்" }, TA_LIVE);
    expect(res).toMatchObject({ action: "ask_verbatim", question_number: 2 });
    expect(crmRepo.createLead).toHaveBeenCalledTimes(1);
    expect(leads.size).toBe(1);
    const [lead] = leads.values();
    expect(lead.qualification_notes).toMatch(/^Q1 \[YES\] \([0-9T:.Z-]+\): Yes$/);
  });

  it("reuses the SAME auto-created lead across the whole call — no duplicate leads, notes accumulate", async () => {
    const { tool, crmRepo, leads } = buildLive();
    await tool.execute({ last_answered_question: 1, user_response: "ஆம்" }, TA_LIVE);
    await tool.execute({ last_answered_question: 2, user_response: "இல்லை" }, TA_LIVE);
    await tool.execute({ last_answered_question: 3, user_response: "இருந்தாலும்" }, TA_LIVE);
    expect(crmRepo.createLead).toHaveBeenCalledTimes(1); // one lead for the whole call
    expect(leads.size).toBe(1);
    const [lead] = leads.values();
    expect(lead.qualification_notes.split("\n")).toEqual([
      expect.stringContaining("Q1 [YES]"),
      expect.stringContaining("Q2 [NO]"),
      expect.stringContaining("Q3 [MAYBE]"),
    ]);
  });

  it("an explicit lead_id from the model (once it HAS called save_lead) is still honored and takes priority", async () => {
    const { tool, crmRepo } = build(LeadTemperature.HOT);
    await tool.execute({ last_answered_question: 3, user_response: "ஆம்", lead_id: "l1" }, TA_LIVE);
    // conversation-based resolution is never consulted when lead_id is given.
    expect(crmRepo.getLeadByConversationId).not.toHaveBeenCalled();
    expect(crmRepo.updateLeadQualification).toHaveBeenCalledWith("l1", expect.anything());
  });

  describe("integration: Q1 → spoken answer → server classification → Live Transcript-ready record → Q2", () => {
    it.each([
      ["ஆம்", "YES"],
      ["இல்லை", "NO"],
      ["இருந்தாலும்", "MAYBE"],
    ])('"%s" is classified %s, persisted, and Q2 becomes the next question — no lead_id ever supplied by the model', async (reply, cls) => {
      const { tool, leads } = buildLive();
      const res = (await tool.execute({ last_answered_question: 1, user_response: reply }, TA_LIVE)) as Record<string, unknown>;

      // 1. Server classification succeeded and the exact next question came back.
      expect(res.action).toBe("ask_verbatim");
      expect(res.question_number).toBe(2);
      expect(res.question).toBe(getAuthoredQuestion(2)!.question);
      expect(res.speak).toBe(withAnswerGuidance(getAuthoredQuestion(2)!.question));

      // 2. The canonical classification was actually persisted — this is
      // exactly what the qualification-status endpoint parses back out into
      // the { n: 1, c: "YES"/"NO"/"MAYBE", a: "Yes"/"No"/"Maybe" } shape the
      // Live Transcript renders as "User: YES/NO/MAYBE".
      const [lead] = leads.values();
      expect(lead.qualification_notes).toContain(`Q1 [${cls}]`);
    });
  });
});

/**
 * The English counterpart — same server-owned sequencing tool, same
 * branching rules, exercised in English exactly as the Tamil suite above
 * exercises it in Tamil. Proves the closed-ended flow genuinely works for
 * English sessions, not just that the code compiles for them.
 */
describe("get_next_qualification_question — English closed-ended flow", () => {
  it("walks Set 1 in exact authored order (0→Q1 … 6→Q7), speaking question+guidance in English", async () => {
    const { tool } = build(null);
    for (let last = 0; last <= 6; last++) {
      const res = await tool.execute({ last_answered_question: last, user_response: "yes", lead_id: "l1" }, EN);
      expect(res).toMatchObject({
        action: "ask_verbatim",
        question_number: last + 1,
        question: qEn(last + 1),
        speak: withAnswerGuidance(qEn(last + 1), ENGLISH_ANSWER_GUIDANCE),
      });
    }
  });

  it.each([
    ["yes", "YES"],
    ["no", "NO"],
    ["maybe", "MAYBE"],
  ])('"%s" is classified %s, persisted, and Q2 becomes the next question — no lead_id ever supplied by the model (English)', async (reply, cls) => {
    const { tool, leads } = buildLive();
    const res = (await tool.execute({ last_answered_question: 1, user_response: reply }, EN_LIVE)) as Record<string, unknown>;

    expect(res.action).toBe("ask_verbatim");
    expect(res.question_number).toBe(2);
    expect(res.question).toBe(qEn(2));
    expect(res.speak).toBe(withAnswerGuidance(qEn(2), ENGLISH_ANSWER_GUIDANCE));

    const [lead] = leads.values();
    expect(lead.qualification_notes).toContain(`Q1 [${cls}]`);
  });

  it("an invalid English reply reprompts with the English guidance, stays on the SAME question, and stores NOTHING", async () => {
    const { tool, crmRepo } = build(LeadTemperature.HOT);
    for (const invalid of ["yes we have a problem", "sure", "I don't know", "maybe later", ""]) {
      const res = (await tool.execute({ last_answered_question: 3, user_response: invalid, lead_id: "l1" }, EN)) as Record<string, unknown>;
      expect(res.action).toBe("reprompt");
      expect(res.question_number).toBe(3);
      expect(res.speak).toBe(ENGLISH_ANSWER_GUIDANCE);
    }
    expect(crmRepo.updateLeadQualification).not.toHaveBeenCalled();
  });

  it("Q10 = no skips the conditional Q11 → Q12 (English)", async () => {
    const { tool } = build(LeadTemperature.HOT);
    const res = await tool.execute({ last_answered_question: 10, user_response: "no", lead_id: "l1" }, EN);
    expect(res).toMatchObject({ action: "ask_verbatim", question_number: 12, question: qEn(12) });
  });

  it.each(["yes", "maybe"])("Q10 = %s asks the conditional Q11 (English)", async (reply) => {
    const { tool } = build(LeadTemperature.HOT);
    const res = await tool.execute({ last_answered_question: 10, user_response: reply, lead_id: "l1" }, EN);
    expect(res).toMatchObject({ action: "ask_verbatim", question_number: 11, question: qEn(11) });
  });

  it("Q13 is never asked in English either: Q12 → Q14", async () => {
    const { tool } = build(LeadTemperature.HOT);
    const res = await tool.execute({ last_answered_question: 12, user_response: "yes", lead_id: "l1" }, EN);
    expect(res).toMatchObject({ action: "ask_verbatim", question_number: 14, question: qEn(14) });
  });

  it("COLD after Q7 → Q16 in English too — skips Q8-Q15, still gets calendar consent", async () => {
    const { tool } = build(LeadTemperature.COLD);
    const res = (await tool.execute({ last_answered_question: 7, user_response: "no", lead_id: "l1" }, EN)) as Record<string, unknown>;
    expect(res).toMatchObject({ action: "ask_verbatim", question_number: 16, question: qEn(16) });
    expect(String(res.note)).toContain("still be able to book");
  });

  it("Q17 → complete_proceed_to_booking (English)", async () => {
    const { tool } = build(LeadTemperature.WARM);
    const done = (await tool.execute({ last_answered_question: 17, user_response: "yes", lead_id: "l1" }, EN)) as { action: string };
    expect(done.action).toBe("complete_proceed_to_booking");
  });

  it("no full English walk can ever produce question 13", async () => {
    const { tool } = build(LeadTemperature.HOT);
    const seen: number[] = [];
    let last = 0;
    for (let guard = 0; guard < 20; guard++) {
      const res = (await tool.execute({ last_answered_question: last, user_response: "yes", lead_id: "l1" }, EN)) as Record<string, unknown>;
      if (res.action !== "ask_verbatim") break;
      seen.push(res.question_number as number);
      last = res.question_number as number;
    }
    expect(seen).not.toContain(13);
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17]);
  });
});

/**
 * Root-cause regression: get_next_qualification_question's Q7 branch used
 * to only READ lead_temperature to decide COLD-vs-HOT/WARM routing — but
 * nothing in the closed-ended flow ever WROTE it (save_lead, the only other
 * writer, is deliberately skipped per the directive). lead_temperature
 * stayed null for the ENTIRE call, so AppointmentModal's "Continue" button
 * (gated on temperature !== null) never appeared, and COLD routing never
 * actually fired either — every lead silently fell through to the "unknown
 * -> continue as HOT/WARM" default. The fix computes-and-persists a real
 * score from the Q1-Q7 answers the moment Q7 completes.
 */
describe("get_next_qualification_question — temperature is now actually computed at Q7 (the bug behind the missing Continue button)", () => {
  /** answers[] are the replies to Q1..Q7 in order. last_answered_question=0
   * only fetches Q1 (its user_response is ignored — nothing was answered
   * yet); the answer to question N is submitted via last_answered_question:
   * N, so the final call here (last=7, answers[6]) is what submits Q7's
   * answer and triggers the Q7-boundary scoring. */
  async function walkToQ7(tool: ReturnType<typeof buildLive>["tool"], ctx: typeof EN_LIVE, answers: string[]) {
    let res = (await tool.execute({ last_answered_question: 0, user_response: "" }, ctx)) as Record<string, unknown>;
    let last = res.question_number as number;
    for (const answer of answers) {
      res = (await tool.execute({ last_answered_question: last, user_response: answer }, ctx)) as Record<string, unknown>;
      last = res.question_number as number;
    }
    return res;
  }

  it("7 YES answers score HOT, persist it, and route to Q8 (not the COLD skip)", async () => {
    const { tool, leads } = buildLive();
    const res = await walkToQ7(tool, EN_LIVE, ["yes", "yes", "yes", "yes", "yes", "yes", "yes"]);
    expect(res).toMatchObject({ action: "ask_verbatim", question_number: 8 });
    const [lead] = leads.values();
    expect(lead.lead_temperature).toBe(LeadTemperature.HOT);
  });

  it("7 NO answers score COLD, persist it, and route straight to Q16 — the lead is never discarded", async () => {
    const { tool, leads } = buildLive();
    const res = (await walkToQ7(tool, EN_LIVE, ["no", "no", "no", "no", "no", "no", "no"])) as Record<string, unknown>;
    expect(res).toMatchObject({ action: "ask_verbatim", question_number: 16 });
    expect(String(res.note)).toContain("COLD");
    const [lead] = leads.values();
    expect(lead.lead_temperature).toBe(LeadTemperature.COLD);
  });

  it("a mixed set of answers scores WARM and routes to Q8, not the COLD skip", async () => {
    const { tool, leads } = buildLive();
    // 4 YES + 2 MAYBE + 1 NO = 5 points -> WARM band (>= 3.5, < 5.5).
    const res = await walkToQ7(tool, EN_LIVE, ["yes", "yes", "yes", "yes", "maybe", "maybe", "no"]);
    expect(res).toMatchObject({ action: "ask_verbatim", question_number: 8 });
    const [lead] = leads.values();
    expect(lead.lead_temperature).toBe(LeadTemperature.WARM);
  });

  it("only scores ONCE — a lead that already has a temperature keeps it rather than being rescored", async () => {
    const { tool, crmRepo } = build(LeadTemperature.HOT, "Q1 [YES] (t): Yes\nQ2 [NO] (t): No");
    await tool.execute({ last_answered_question: 7, user_response: "no", lead_id: "l1" }, EN);
    // The lead already had a temperature (HOT) — updateLeadQualification is
    // only called to append the Q7 answer's own note line, never to
    // overwrite lead_temperature a second time.
    const calls = crmRepo.updateLeadQualification.mock.calls;
    for (const [, patch] of calls) expect(patch).not.toHaveProperty("lead_temperature");
  });
});

describe('get_next_qualification_question — Q17 completion says the exact "Please Click to Continue" phrase', () => {
  it("English: returns the exact approved phrase, never a paraphrase, and never claims the appointment is booked", async () => {
    const { tool } = build(LeadTemperature.WARM);
    const res = (await tool.execute({ last_answered_question: 17, user_response: "yes", lead_id: "l1" }, EN)) as Record<string, unknown>;
    expect(res.action).toBe("complete_proceed_to_booking");
    expect(res.speak).toBe(ENGLISH_CONTINUE_PROMPT);
    expect(res.speak).toBe("Please Click to Continue");
  });

  it("Tamil: returns the Tamil continue instruction, not the English phrase", async () => {
    const { tool } = build(LeadTemperature.WARM);
    const res = (await tool.execute({ last_answered_question: 17, user_response: "ஆம்", lead_id: "l1" }, TA)) as Record<string, unknown>;
    expect(res.action).toBe("complete_proceed_to_booking");
    expect(res.speak).toBe(TAMIL_CONTINUE_PROMPT);
    expect(res.speak).not.toBe(ENGLISH_CONTINUE_PROMPT);
  });
});
