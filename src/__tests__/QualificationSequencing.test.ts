/**
 * The server owns the qualification order: after each stored answer the
 * model must call get_next_qualification_question, and what comes back is
 * authoritative — exact authored wording for Q1-Q17, and the Set-1/Set-2
 * boundary routed from the lead's REAL stored temperature (COLD skips the
 * conversion set but is explicitly still sent to booking).
 */
import { ToolRegistry } from "@/core/application/tools/ToolRegistry";
import { LeadTemperature } from "@/core/domain/models/types";
import { TAMIL_QUALIFICATION_SET1, TAMIL_QUALIFICATION_SET2 } from "@/features/voice/lib/qualificationScript";

function registryWithLead(temperature: LeadTemperature | null) {
  const crmRepo = { getLeadById: jest.fn().mockResolvedValue(temperature ? { id: "l1", lead_temperature: temperature } : null) } as never;
  const registry = new ToolRegistry(crmRepo, {} as never, {} as never);
  return registry.getTool("get_next_qualification_question")!;
}

const TA = { companyId: "c1", employeeId: "e1", language: "ta" as const };

describe("get_next_qualification_question", () => {
  it("walks Set 1 in exact authored order (0→Q1 … 6→Q7)", async () => {
    const tool = registryWithLead(null);
    for (let last = 0; last <= 6; last++) {
      const res = await tool.execute({ last_answered_question: last }, TA);
      expect(res).toEqual({ action: "ask_verbatim", question_number: last + 1, question: TAMIL_QUALIFICATION_SET1[last] });
    }
  });

  it.each([LeadTemperature.HOT, LeadTemperature.WARM])("%s after Q7 → Q8 (Set 2 begins)", async (temp) => {
    const tool = registryWithLead(temp);
    const res = await tool.execute({ last_answered_question: 7, lead_id: "l1" }, TA);
    expect(res).toEqual({ action: "ask_verbatim", question_number: 8, question: TAMIL_QUALIFICATION_SET2[0] });
  });

  it("COLD after Q7 → skip Set 2, proceed to booking — and the message says COLD still books", async () => {
    const tool = registryWithLead(LeadTemperature.COLD);
    const res = (await tool.execute({ last_answered_question: 7, lead_id: "l1" }, TA)) as { action: string; message: string };
    expect(res.action).toBe("cold_proceed_to_booking");
    expect(res.message).toContain("do NOT ask the conversion questions");
    expect(res.message).toContain("still be able to book");
  });

  it("unknown temperature (no lead_id / lookup miss) safely continues to Q8 rather than discarding", async () => {
    const tool = registryWithLead(null);
    const res = await tool.execute({ last_answered_question: 7 }, TA);
    expect(res).toMatchObject({ action: "ask_verbatim", question_number: 8 });
  });

  it("walks Set 2 in exact authored order (8→Q9 … 16→Q17)", async () => {
    const tool = registryWithLead(LeadTemperature.HOT);
    for (let last = 8; last <= 16; last++) {
      const res = await tool.execute({ last_answered_question: last, lead_id: "l1" }, TA);
      expect(res).toEqual({ action: "ask_verbatim", question_number: last + 1, question: TAMIL_QUALIFICATION_SET2[last - 7] });
    }
  });

  it("after Q17 → complete, proceed to booking", async () => {
    const tool = registryWithLead(LeadTemperature.HOT);
    const res = (await tool.execute({ last_answered_question: 17, lead_id: "l1" }, TA)) as { action: string };
    expect(res.action).toBe("complete_proceed_to_booking");
  });

  it("non-Tamil sessions get the freeform action — the authored script never leaks into other languages", async () => {
    const tool = registryWithLead(LeadTemperature.HOT);
    const res = (await tool.execute({ last_answered_question: 0 }, { ...TA, language: "en" })) as { action: string };
    expect(res.action).toBe("freeform");
  });

  it("rejects out-of-range or non-integer inputs instead of guessing", async () => {
    const tool = registryWithLead(null);
    expect(((await tool.execute({ last_answered_question: -1 }, TA)) as { action: string }).action).toBe("error");
    expect(((await tool.execute({ last_answered_question: 18 }, TA)) as { action: string }).action).toBe("error");
    expect(((await tool.execute({ last_answered_question: 3.5 }, TA)) as { action: string }).action).toBe("error");
  });
});
