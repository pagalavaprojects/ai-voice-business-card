/**
 * The server owns the questionnaire (2026-08-13 revision): exactly six
 * questions, straight sequence, no gaps, no branching, no language
 * dispatch — SERVER-side classification of the raw reply (only yes/no/
 * maybe are valid; anything else reprompts without advancing or storing)
 * plus per-question answer recording onto the lead's existing
 * qualification_notes field. Qualification completion is deliberately
 * decoupled from lead scoring: this tool never computes or persists
 * lead_temperature.
 */
import { ToolRegistry } from "@/core/application/tools/ToolRegistry";
import { LeadTemperature } from "@/core/domain/models/types";
import {
  classifyClosedResponse,
  getAuthoredQuestion,
  QUALIFICATION_ANSWER_GUIDANCE,
  QUALIFICATION_ANSWER_GUIDANCE_TA,
  QUALIFICATION_CONTINUE_PROMPT,
  QUALIFICATION_CONTINUE_PROMPT_TA,
  QUALIFICATION_QUESTIONS_TA,
  withAnswerGuidance,
} from "@/features/voice/lib/qualificationScript";

function build(notes = "") {
  const lead = notes ? { id: "l1", lead_temperature: null, qualification_notes: notes } : null;
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

const CTX = { companyId: "c1", employeeId: "e1" };
const LIVE = { companyId: "c1", employeeId: "e1", conversationId: "conv-1" };
const q = (n: number) => getAuthoredQuestion(n)!.question;

describe("get_next_qualification_question (six-question revision)", () => {
  it("walks the full sequence in exact authored order (0→Q1 … 5→Q6), speaking question+guidance", async () => {
    const { tool } = build();
    for (let last = 0; last <= 5; last++) {
      const res = await tool.execute({ last_answered_question: last, user_response: "yes", lead_id: "l1" }, CTX);
      expect(res).toMatchObject({
        action: "ask_verbatim",
        question_number: last + 1,
        question: q(last + 1),
        speak: withAnswerGuidance(q(last + 1)),
      });
    }
  });

  it("Q6 → complete_proceed_to_booking with the exact Continue-button phrase", async () => {
    const { tool } = build();
    const res = (await tool.execute({ last_answered_question: 6, user_response: "yes", lead_id: "l1" }, CTX)) as Record<string, unknown>;
    expect(res.action).toBe("complete_proceed_to_booking");
    expect(res.speak).toBe(QUALIFICATION_CONTINUE_PROMPT);
    expect(res.speak).toBe("Please Click to Continue");
    expect(String(res.message)).toContain("NOT booked yet");
    expect(String(res.message)).not.toMatch(/is confirmed|has been confirmed/i);
  });

  it("no full walk can ever produce a seventh question or reintroduce Q13/Q16/Q17", async () => {
    const { tool } = build();
    const seen: number[] = [];
    let last = 0;
    for (let guard = 0; guard < 20; guard++) {
      const res = (await tool.execute({ last_answered_question: last, user_response: "yes", lead_id: "l1" }, CTX)) as Record<string, unknown>;
      if (res.action !== "ask_verbatim") break;
      seen.push(res.question_number as number);
      last = res.question_number as number;
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6]);
    expect(seen).not.toContain(7);
    expect(seen).not.toContain(13);
    expect(seen).not.toContain(17);
  });

  it.each([
    ["yes", "YES", "Yes"],
    ["no", "NO", "No"],
    ["maybe", "MAYBE", "Maybe"],
  ])("records %s as Qn [%s]: %s — classification derived by the SERVER, never the model", async (reply, cls, english) => {
    const { tool, crmRepo } = build("existing internal note");
    await tool.execute({ last_answered_question: 3, user_response: reply, lead_id: "l1" }, CTX);
    expect(crmRepo.updateLeadQualification).toHaveBeenCalledTimes(1);
    const patch = crmRepo.updateLeadQualification.mock.calls[0][1] as { qualification_notes: string };
    expect(patch.qualification_notes).toMatch(new RegExp(`^existing internal note\\nQ3 \\[${cls}\\] \\([0-9T:.Z-]+\\): ${english}$`));
    // Qualification recording never touches lead_temperature — completion
    // and scoring are deliberately separate concerns.
    expect(patch).not.toHaveProperty("lead_temperature");
  });

  it("an invalid reply reprompts with the guidance, stays on the SAME question, and stores NOTHING", async () => {
    const { tool, crmRepo } = build();
    for (const invalid of ["yes we have a problem", "sure", "I don't know", "maybe later", ""]) {
      const res = (await tool.execute({ last_answered_question: 3, user_response: invalid, lead_id: "l1" }, CTX)) as Record<string, unknown>;
      expect(res.action).toBe("reprompt");
      expect(res.question_number).toBe(3);
      expect(res.speak).toBe(QUALIFICATION_ANSWER_GUIDANCE);
    }
    expect(crmRepo.updateLeadQualification).not.toHaveBeenCalled();
  });

  it("a missing user_response also reprompts rather than advancing on nothing", async () => {
    const { tool, crmRepo } = build();
    const res = (await tool.execute({ last_answered_question: 5, lead_id: "l1" }, CTX)) as { action: string };
    expect(res.action).toBe("reprompt");
    expect(crmRepo.updateLeadQualification).not.toHaveBeenCalled();
  });

  it("rejects out-of-range/non-integer inputs (valid range is now 0-6)", async () => {
    const { tool } = build();
    for (const bad of [-1, 7, 13, 17, 3.5]) {
      expect(((await tool.execute({ last_answered_question: bad }, CTX)) as { action: string }).action).toBe("error");
    }
  });

  it("is language-AWARE for the two authored sets: en and every non-Tamil language ask the English questions", async () => {
    for (const language of [undefined, "en", "hi", "te", "ml", "kn"]) {
      const { tool } = build();
      const res = (await tool.execute({ last_answered_question: 0 }, { ...CTX, language })) as Record<string, unknown>;
      expect(res.action).toBe("ask_verbatim");
      expect(res.question_number).toBe(1);
      expect(res.question).toBe(q(1));
    }
  });

  // The 2026-08-19 product decision: qualification language follows the
  // selected card language for the authored languages. ONE engine, same
  // sequencing, same canonical persistence — only the spoken content and
  // accepted answer words are dispatched.
  describe("Tamil qualification (context.language = 'ta') — same engine, Tamil content", () => {
    const TA_CTX = { ...CTX, language: "ta" as const };

    it("integration: starting a Tamil session and answering Q1 with ஆம் returns TAMIL Q2 and persists canonical Yes", async () => {
      const { tool, crmRepo } = build("existing note");
      const opening = (await tool.execute({ last_answered_question: 0 }, TA_CTX)) as Record<string, unknown>;
      expect(opening.question).toBe(QUALIFICATION_QUESTIONS_TA[0].question);
      expect(String(opening.speak)).toContain(QUALIFICATION_ANSWER_GUIDANCE_TA);

      const res = (await tool.execute({ last_answered_question: 1, user_response: "ஆம்", lead_id: "l1" }, TA_CTX)) as Record<string, unknown>;
      expect(res.action).toBe("ask_verbatim");
      expect(res.question_number).toBe(2);
      expect(res.question).toBe(QUALIFICATION_QUESTIONS_TA[1].question);
      // Persisted record stays canonical English regardless of language.
      const [, patch] = crmRepo.updateLeadQualification.mock.calls[0];
      expect(String(patch.qualification_notes)).toMatch(/Q1 \[YES\] \([^)]+\): Yes$/);
    });

    it("classifies இல்லை → NO and இருந்தாலும் → MAYBE, walking Q2→Q3→Q4 in Tamil", async () => {
      const { tool, crmRepo } = build("existing note");
      const r2 = (await tool.execute({ last_answered_question: 2, user_response: "இல்லை", lead_id: "l1" }, TA_CTX)) as Record<string, unknown>;
      expect(r2.question).toBe(QUALIFICATION_QUESTIONS_TA[2].question);
      const r3 = (await tool.execute({ last_answered_question: 3, user_response: "இருந்தாலும்", lead_id: "l1" }, TA_CTX)) as Record<string, unknown>;
      expect(r3.question).toBe(QUALIFICATION_QUESTIONS_TA[3].question);
      const notes = crmRepo.updateLeadQualification.mock.calls.map(([, p]) => String(p.qualification_notes)).join("\n");
      expect(notes).toContain("Q2 [NO]");
      expect(notes).toContain("Q3 [MAYBE]");
    });

    it("invalid Tamil answers (சரி, okay, English yes, free-form) reprompt with the TAMIL guidance and store nothing", async () => {
      for (const bad of ["சரி", "okay", "yes", "எனக்கு தெரியவில்லை", "ஆம் ஆனால் யோசிக்கணும்"]) {
        const { tool, crmRepo } = build();
        const res = (await tool.execute({ last_answered_question: 1, user_response: bad, lead_id: "l1" }, TA_CTX)) as Record<string, unknown>;
        expect(res.action).toBe("reprompt");
        expect(res.question_number).toBe(1);
        expect(res.speak).toBe(QUALIFICATION_ANSWER_GUIDANCE_TA);
        expect(crmRepo.updateLeadQualification).not.toHaveBeenCalled();
      }
    });

    it("accepts the documented ASR variants ஆமாம்/ஆமா/இல்ல", async () => {
      expect(classifyClosedResponse("ஆமாம்", "ta")).toBe("YES");
      expect(classifyClosedResponse("ஆமா", "ta")).toBe("YES");
      expect(classifyClosedResponse("இல்ல", "ta")).toBe("NO");
    });

    it("a full Tamil walk completes after Q6 with the TAMIL continue prompt — never a seventh question", async () => {
      const { tool } = build();
      let last = 0;
      const seen: string[] = [];
      for (let i = 0; i < 6; i++) {
        const res = (await tool.execute({ last_answered_question: last, user_response: "ஆம்", lead_id: "l1" }, TA_CTX)) as Record<string, unknown>;
        if (res.action !== "ask_verbatim") break;
        seen.push(String(res.question));
        last = res.question_number as number;
      }
      expect(seen).toEqual(QUALIFICATION_QUESTIONS_TA.map((x) => x.question));
      const done = (await tool.execute({ last_answered_question: 6, user_response: "ஆம்", lead_id: "l1" }, TA_CTX)) as Record<string, unknown>;
      expect(done.action).toBe("complete_proceed_to_booking");
      expect(done.speak).toBe(QUALIFICATION_CONTINUE_PROMPT_TA);
    });

    it("English tokens do NOT classify in Tamil mode, and Tamil tokens do NOT classify in English mode", async () => {
      expect(classifyClosedResponse("yes", "ta")).toBeNull();
      expect(classifyClosedResponse("ஆம்", "en")).toBeNull();
    });
  });

  it("never computes or persists lead_temperature at any point in the sequence — scoring and completion are separate", async () => {
    const { tool, crmRepo } = build();
    let last = 0;
    for (let i = 0; i < 6; i++) {
      const res = (await tool.execute({ last_answered_question: last, user_response: "yes", lead_id: "l1" }, CTX)) as Record<string, unknown>;
      last = (res.question_number as number) ?? last;
    }
    for (const [, patch] of crmRepo.updateLeadQualification.mock.calls) {
      expect(patch).not.toHaveProperty("lead_temperature");
    }
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
    const res = await tool.execute({ last_answered_question: 1, user_response: "yes" }, LIVE);
    expect(res).toMatchObject({ action: "ask_verbatim", question_number: 2 });
    expect(crmRepo.createLead).toHaveBeenCalledTimes(1);
    expect(leads.size).toBe(1);
    const [lead] = leads.values();
    expect(lead.qualification_notes).toMatch(/^Q1 \[YES\] \([0-9T:.Z-]+\): Yes$/);
  });

  it("reuses the SAME auto-created lead across the whole call — no duplicate leads, notes accumulate", async () => {
    const { tool, crmRepo, leads } = buildLive();
    await tool.execute({ last_answered_question: 1, user_response: "yes" }, LIVE);
    await tool.execute({ last_answered_question: 2, user_response: "no" }, LIVE);
    await tool.execute({ last_answered_question: 3, user_response: "maybe" }, LIVE);
    expect(crmRepo.createLead).toHaveBeenCalledTimes(1); // one lead for the whole call
    expect(leads.size).toBe(1);
    const [lead] = leads.values();
    expect(lead.qualification_notes.split("\n")).toEqual([
      expect.stringContaining("Q1 [YES]"),
      expect.stringContaining("Q2 [NO]"),
      expect.stringContaining("Q3 [MAYBE]"),
    ]);
  });

  // Regression: a voice model retrying a tool call it isn't sure landed (a
  // known LLM tool-calling behavior) previously double-appended the SAME
  // question's answer — each call independently read-modified-wrote the
  // full notes string with no idempotency check. The booking UI would then
  // render the question twice, and — worse — two calls racing for
  // DIFFERENT questions could silently lose one via the same read-then-
  // overwrite pattern, even though the live voice conversation kept
  // advancing normally. This is the actual mechanism behind qualification
  // that sounded complete on the call but rendered incomplete/stuck on
  // screen.
  it("a duplicate call for an already-answered question does not create a duplicate note line", async () => {
    const { tool, leads } = buildLive();
    await tool.execute({ last_answered_question: 1, user_response: "yes" }, LIVE);
    const retry = await tool.execute({ last_answered_question: 1, user_response: "yes" }, LIVE);
    expect(retry).toMatchObject({ action: "ask_verbatim", question_number: 2 }); // still answers correctly
    const [lead] = leads.values();
    expect(lead.qualification_notes.split("\n")).toEqual([expect.stringContaining("Q1 [YES]")]); // exactly one line
  });

  it("a duplicate call cannot overwrite a later question's already-recorded answer", async () => {
    const { tool, leads } = buildLive();
    await tool.execute({ last_answered_question: 1, user_response: "yes" }, LIVE);
    await tool.execute({ last_answered_question: 2, user_response: "no" }, LIVE);
    // A late retry of Q1's call arrives after Q2 has already been recorded —
    // it must not clobber Q2's line by writing from a stale pre-Q2 read.
    await tool.execute({ last_answered_question: 1, user_response: "yes" }, LIVE);
    const [lead] = leads.values();
    expect(lead.qualification_notes.split("\n")).toEqual([expect.stringContaining("Q1 [YES]"), expect.stringContaining("Q2 [NO]")]);
  });

  it("an explicit lead_id from the model (once it HAS called save_lead) is still honored and takes priority", async () => {
    const { tool, crmRepo } = build("existing note");
    await tool.execute({ last_answered_question: 3, user_response: "yes", lead_id: "l1" }, LIVE);
    // conversation-based resolution is never consulted when lead_id is given.
    expect(crmRepo.getLeadByConversationId).not.toHaveBeenCalled();
    expect(crmRepo.updateLeadQualification).toHaveBeenCalledWith("l1", expect.anything());
  });

  it("walking all six questions end to end via conversationId resolution completes and hands off to booking", async () => {
    const { tool, leads } = buildLive();
    // Seed call: last_answered_question=0 only fetches Q1 (its own
    // user_response is ignored — nothing was answered yet). The answer to
    // question N is submitted via last_answered_question: N, so each
    // subsequent call submits the PREVIOUS question's answer.
    let res = (await tool.execute({ last_answered_question: 0, user_response: "" }, LIVE)) as Record<string, unknown>;
    let last = res.question_number as number;
    let final: Record<string, unknown> = res;
    for (const reply of ["yes", "no", "yes", "maybe", "yes", "yes"]) {
      final = (await tool.execute({ last_answered_question: last, user_response: reply }, LIVE)) as Record<string, unknown>;
      last = (final.question_number as number) ?? last;
    }
    expect(final.action).toBe("complete_proceed_to_booking");
    const [lead] = leads.values();
    const recorded = lead.qualification_notes.split("\n").map((l) => l.split(" ")[0]);
    expect(recorded).toEqual(["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"]);
    // Completion never wrote a temperature — it's decoupled from scoring.
    expect(lead.lead_temperature).toBeNull();
  });
});
