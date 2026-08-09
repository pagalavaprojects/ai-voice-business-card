/**
 * The server owns the questionnaire (2026-08-10 revision): exact authored
 * order, the Q10→Q11 condition, the deliberate Q13 gap, COLD routing
 * (skip Q8–Q15 but STILL ask Q16–Q17 — a COLD lead always still books),
 * strict YES/NO/MAYBE classification, and per-question answer recording
 * onto the lead's existing qualification_notes field.
 */
import { ToolRegistry } from "@/core/application/tools/ToolRegistry";
import { LeadTemperature } from "@/core/domain/models/types";
import { getAuthoredQuestion, TAMIL_QUALIFICATION_QUESTIONS } from "@/features/voice/lib/qualificationScript";

function build(temperature: LeadTemperature | null, notes = "") {
  const lead = temperature !== null || notes ? { id: "l1", lead_temperature: temperature, qualification_notes: notes } : null;
  const crmRepo = {
    getLeadById: jest.fn().mockResolvedValue(lead),
    updateLeadQualification: jest.fn().mockResolvedValue({}),
  };
  const registry = new ToolRegistry(crmRepo as never, {} as never, {} as never);
  return { tool: registry.getTool("get_next_qualification_question")!, crmRepo };
}

const TA = { companyId: "c1", employeeId: "e1", language: "ta" as const };
const q = (n: number) => getAuthoredQuestion(n)!.question;

describe("get_next_qualification_question (2026-08-10 questionnaire)", () => {
  it("walks Set 1 in exact authored order (0→Q1 … 6→Q7)", async () => {
    const { tool } = build(null);
    for (let last = 0; last <= 6; last++) {
      const res = await tool.execute({ last_answered_question: last, classification: "YES", answer_english: "x", lead_id: "l1" }, TA);
      expect(res).toMatchObject({ action: "ask_verbatim", question_number: last + 1, question: q(last + 1) });
    }
  });

  it.each([LeadTemperature.HOT, LeadTemperature.WARM])("%s after Q7 → Q8", async (temp) => {
    const { tool } = build(temp);
    const res = await tool.execute({ last_answered_question: 7, classification: "YES", answer_english: "x", lead_id: "l1" }, TA);
    expect(res).toMatchObject({ action: "ask_verbatim", question_number: 8, question: q(8) });
  });

  it("COLD after Q7 → Q16 (skips Q8–Q15, still gets calendar consent — never discarded)", async () => {
    const { tool } = build(LeadTemperature.COLD);
    const res = (await tool.execute({ last_answered_question: 7, classification: "NO", answer_english: "x", lead_id: "l1" }, TA)) as Record<string, unknown>;
    expect(res).toMatchObject({ action: "ask_verbatim", question_number: 16, question: q(16) });
    expect(String(res.note)).toContain("still be able to book");
  });

  it("Q10 = NO skips the conditional Q11 → Q12", async () => {
    const { tool } = build(LeadTemperature.HOT);
    const res = await tool.execute({ last_answered_question: 10, classification: "NO", answer_english: "Nothing is blocking me", lead_id: "l1" }, TA);
    expect(res).toMatchObject({ action: "ask_verbatim", question_number: 12, question: q(12) });
  });

  it.each(["YES", "MAYBE"])("Q10 = %s asks the conditional Q11", async (c) => {
    const { tool } = build(LeadTemperature.HOT);
    const res = await tool.execute({ last_answered_question: 10, classification: c, answer_english: "x", lead_id: "l1" }, TA);
    expect(res).toMatchObject({ action: "ask_verbatim", question_number: 11, question: q(11) });
  });

  it("Q13 is never asked: Q12 → Q14, and 13 is rejected as input", async () => {
    const { tool } = build(LeadTemperature.HOT);
    const after12 = await tool.execute({ last_answered_question: 12, classification: "YES", answer_english: "x", lead_id: "l1" }, TA);
    expect(after12).toMatchObject({ action: "ask_verbatim", question_number: 14, question: q(14) });
    const bad = (await tool.execute({ last_answered_question: 13 }, TA)) as { action: string };
    expect(bad.action).toBe("error");
  });

  it("no full walk can ever produce question 13", async () => {
    const { tool } = build(LeadTemperature.HOT);
    const seen: number[] = [];
    let last = 0;
    for (let guard = 0; guard < 20; guard++) {
      const res = (await tool.execute({ last_answered_question: last, classification: "YES", answer_english: "x", lead_id: "l1" }, TA)) as Record<string, unknown>;
      if (res.action !== "ask_verbatim") break;
      seen.push(res.question_number as number);
      last = res.question_number as number;
    }
    expect(seen).not.toContain(13);
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17]);
  });

  it("Q14 → Q15 → Q16 → Q17 → complete_proceed_to_booking", async () => {
    const { tool } = build(LeadTemperature.WARM);
    expect(await tool.execute({ last_answered_question: 14, classification: "YES", answer_english: "x", lead_id: "l1" }, TA)).toMatchObject({ question_number: 15 });
    expect(await tool.execute({ last_answered_question: 15, classification: "NO", answer_english: "x", lead_id: "l1" }, TA)).toMatchObject({ question_number: 16 });
    expect(await tool.execute({ last_answered_question: 16, classification: "YES", answer_english: "x", lead_id: "l1" }, TA)).toMatchObject({ question_number: 17 });
    const done = (await tool.execute({ last_answered_question: 17, classification: "YES", answer_english: "x", lead_id: "l1" }, TA)) as { action: string };
    expect(done.action).toBe("complete_proceed_to_booking");
  });

  it("records each answer on qualification_notes: Qn [CLASS] (timestamp): english", async () => {
    const { tool, crmRepo } = build(LeadTemperature.HOT, "existing internal note");
    await tool.execute({ last_answered_question: 3, classification: "MAYBE", answer_english: "They tried a CRM once", lead_id: "l1" }, TA);
    expect(crmRepo.updateLeadQualification).toHaveBeenCalledTimes(1);
    const patch = crmRepo.updateLeadQualification.mock.calls[0][1] as { qualification_notes: string };
    expect(patch.qualification_notes).toMatch(/^existing internal note\nQ3 \[MAYBE\] \([0-9T:.Z-]+\): They tried a CRM once$/);
  });

  it("rejects classifications outside YES/NO/MAYBE and never persists them", async () => {
    const { tool, crmRepo } = build(LeadTemperature.HOT);
    const res = (await tool.execute({ last_answered_question: 3, classification: "PROBABLY", answer_english: "x", lead_id: "l1" }, TA)) as { action: string };
    expect(res.action).toBe("error");
    expect(crmRepo.updateLeadQualification).not.toHaveBeenCalled();
  });

  it("unknown temperature after Q7 continues to Q8 rather than discarding", async () => {
    const { tool } = build(null);
    const res = await tool.execute({ last_answered_question: 7, classification: "YES", answer_english: "x" }, TA);
    expect(res).toMatchObject({ action: "ask_verbatim", question_number: 8 });
  });

  it("non-Tamil sessions get the freeform action", async () => {
    const { tool } = build(LeadTemperature.HOT);
    const res = (await tool.execute({ last_answered_question: 0 }, { ...TA, language: "en" })) as { action: string };
    expect(res.action).toBe("freeform");
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
