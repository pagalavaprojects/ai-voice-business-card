import { ToolRegistry } from "@/core/application/tools/ToolRegistry";

/**
 * save_lead must promote the conversation's EXISTING lead, not mint a second.
 *
 * get_next_qualification_question creates a placeholder lead keyed on the
 * conversation_id and appends the six recorded Q1..Q6 answers to its
 * qualification_notes. If save_lead then inserts a fresh lead for the same
 * conversation, those answers are orphaned on the placeholder while the
 * real-contact lead (the one a human reviews, and the one scored + alerted on)
 * carries none of them — and the qualification-status poll, which reads the
 * newest lead for the conversation, then reports qualified=false after Q6.
 */

const ARGS = { name: "Visitor", email: "visitor@example.com", phone: "+91 90000 00000" };

function makeRegistry(overrides: Record<string, jest.Mock> = {}) {
  const createLead = jest.fn(async (data: Record<string, unknown>) => ({ id: "lead-new", score_category: "LOW", ...data }));
  const updateLeadQualification = jest.fn(async (id: string, patch: Record<string, unknown>) => ({ id, score_category: "LOW", ...patch }));
  const getLeadByConversationId = jest.fn(async (..._a: unknown[]) => null as unknown);
  const crmRepo = {
    createLead,
    updateLeadQualification,
    getLeadByConversationId,
    ...overrides,
  } as never;
  const registry = new ToolRegistry(crmRepo, {} as never, {} as never);
  return { registry, createLead, updateLeadQualification, getLeadByConversationId };
}

describe("save_lead reuses the conversation lead", () => {
  it("PROMOTES the existing conversation lead (no second lead) when one already exists", async () => {
    const getLeadByConversationId = jest.fn(async (..._a: unknown[]) => ({ id: "lead-placeholder", email: "qualifying-c1@placeholder.maylaanai.internal" }));
    const { registry, createLead, updateLeadQualification } = makeRegistry({ getLeadByConversationId });

    const result = await registry.getTool("save_lead")!.execute(ARGS, { companyId: "c", employeeId: "e", conversationId: "conv-1" } as never);

    // No new lead — the placeholder is updated in place with the real contact.
    expect(createLead).not.toHaveBeenCalled();
    expect(updateLeadQualification).toHaveBeenCalledWith(
      "lead-placeholder",
      expect.objectContaining({ name: ARGS.name, email: ARGS.email, phone: ARGS.phone })
    );
    expect(result.lead_id).toBe("lead-placeholder");
  });

  it("creates a lead when the conversation has none yet", async () => {
    const { registry, createLead } = makeRegistry();

    const result = await registry.getTool("save_lead")!.execute(ARGS, { companyId: "c", employeeId: "e", conversationId: "conv-2" } as never);

    expect(createLead).toHaveBeenCalledTimes(1);
    expect(result.lead_id).toBe("lead-new");
  });

  it("creates a lead (never looks up a conversation) on the form path with no conversationId", async () => {
    const { registry, createLead, getLeadByConversationId } = makeRegistry();

    const result = await registry.getTool("save_lead")!.execute(ARGS, { companyId: "c", employeeId: "e" } as never);

    expect(getLeadByConversationId).not.toHaveBeenCalled();
    expect(createLead).toHaveBeenCalledTimes(1);
    expect(result.lead_id).toBe("lead-new");
  });
});
