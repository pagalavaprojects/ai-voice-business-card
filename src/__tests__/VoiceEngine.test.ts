import { ToolRegistry } from "@/core/application/tools/ToolRegistry";
import { ICRMRepository } from "@/core/domain/repositories/ICRMRepository";
import { IBookingRepository } from "@/core/domain/repositories/IBookingRepository";
import { IKnowledgeRepository } from "@/core/domain/repositories/IKnowledgeRepository";

describe("VoiceEngine Tool Execution & Registry", () => {
  let mockCrmRepo: jest.Mocked<ICRMRepository>;
  let mockBookingRepo: jest.Mocked<IBookingRepository>;
  let mockKnowledgeRepo: jest.Mocked<IKnowledgeRepository>;
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    mockCrmRepo = {
      createLead: jest.fn(),
      getLeadById: jest.fn(),
      getLeadByConversationId: jest.fn(),
      getLeadByEmail: jest.fn(),
      updateLeadScore: jest.fn(),
      updateLeadQualification: jest.fn(),
      updateLeadStatus: jest.fn(),
      updateLeadOwner: jest.fn(),
      updateLeadTags: jest.fn(),
      listLeads: jest.fn(),
      softDeleteLead: jest.fn(),
      addActivity: jest.fn(),
      getActivityTimeline: jest.fn(),
    };

    mockBookingRepo = {
      createAppointment: jest.fn(),
      getAppointmentById: jest.fn(),
      getAppointmentsByEmployee: jest.fn(),
      getAppointmentsByLead: jest.fn(async (_leadId: string) => []),
      listAppointments: jest.fn(),
      updateAppointmentStatus: jest.fn(),
      rescheduleAppointment: jest.fn(),
      cancelAppointment: jest.fn(),
    };

    mockKnowledgeRepo = {
      getCompanyById: jest.fn(),
      getEmployeeById: jest.fn(),
      getEmployeeBySlug: jest.fn(),
      getEmployeeByWhatsAppPhoneNumberId: jest.fn(),
      getProductsByCompany: jest.fn(),
      getServicesByCompany: jest.fn(),
      getFAQsByCompany: jest.fn(),
      searchFAQs: jest.fn(),
      searchProducts: jest.fn(),
    };

    toolRegistry = new ToolRegistry(mockCrmRepo, mockBookingRepo, mockKnowledgeRepo);
  });

  it("should register and execute search_products tool", async () => {
    mockKnowledgeRepo.searchProducts.mockResolvedValue([
      {
        id: "prod-1",
        company_id: "comp-1",
        name: "Voice AI Agent",
        description: "Autonomous voice twin",
        features: ["Low latency"],
        benefits: ["24/7 lead conversion"],
        pricing: 299,
        currency: "USD",
      discount_percent: 0,
      gallery_paths: [],
      display_order: 0,
      is_featured: false,
      is_active: true,
        created_at: "",
        updated_at: "",
      },
    ]);

    const tool = toolRegistry.getTool("search_products");
    expect(tool).toBeDefined();

    const result = await tool!.execute({ query: "voice" }, { companyId: "comp-1", employeeId: "emp-1" });

    expect(mockKnowledgeRepo.searchProducts).toHaveBeenCalledWith("comp-1", "voice");
    expect(result.success).toBe(true);
  });

  it("should return valid function definitions for Vapi assistant", () => {
    const definitions = toolRegistry.getAllToolDefinitions();
    expect(definitions.length).toBeGreaterThanOrEqual(6);
    expect(definitions.some((d) => d.function.name === "save_lead")).toBe(true);
    expect(definitions.some((d) => d.function.name === "book_appointment")).toBe(true);
    expect(definitions.some((d) => d.function.name === "search_products")).toBe(true);
  });

  it("save_lead creates the lead AND actually scores it (Phase 14 wiring)", async () => {
    mockCrmRepo.createLead.mockResolvedValue({
      id: "lead-1",
      company_id: "comp-1",
      employee_id: "emp-1",
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "+15550001111",
      score: 0,
      score_category: "LOW" as never,
      status: "NEW" as never,
      tags: [],
      created_at: "",
      updated_at: "",
    });
    mockCrmRepo.updateLeadQualification.mockResolvedValue({
      id: "lead-1",
      company_id: "comp-1",
      employee_id: "emp-1",
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "+15550001111",
      score: 100,
      score_category: "HIGH" as never,
      score_reasoning: "Budget >= $5,000 (+40), Urgent Timeline (+30), Explicit Need Identified (+30)",
      status: "QUALIFIED" as never,
      lead_temperature: "HOT" as never,
      tags: [],
      created_at: "",
      updated_at: "",
    });

    const tool = toolRegistry.getTool("save_lead")!;
    const result = await tool.execute(
      { name: "Jane Doe", email: "jane@example.com", phone: "+15550001111", budget: 10000, timeline: "ASAP", problem_statement: "Need a voice AI" },
      { companyId: "comp-1", employeeId: "emp-1" }
    );

    expect(mockCrmRepo.createLead).toHaveBeenCalled();
    // The bug this closes: before Phase 14, nothing ever called
    // updateLeadQualification (formerly updateLeadScore) — every lead
    // stayed at score 0/LOW forever.
    expect(mockCrmRepo.updateLeadQualification).toHaveBeenCalledWith(
      "lead-1",
      expect.objectContaining({ score: 100, score_category: "HIGH", score_reasoning: expect.stringContaining("Budget >= $5,000") })
    );
    expect(result.success).toBe(true);
    expect(result.score_category).toBe("HIGH");
  });

  it("book_appointment stores a UUID conversation ID, never the raw Vapi call ID string, in the lead FK path", async () => {
    mockBookingRepo.createAppointment.mockResolvedValue({
      id: "appt-1",
      company_id: "comp-1",
      employee_id: "emp-1",
      lead_id: "lead-1",
      start_time: "2026-08-01T10:00:00Z",
      end_time: "2026-08-01T10:30:00Z",
      status: "BOOKED" as never,
      timezone: "UTC",
      tags: [] as never,
      created_at: "",
      updated_at: "",
    } as never);

    const tool = toolRegistry.getTool("book_appointment")!;
    const result = await tool.execute(
      { lead_id: "lead-1", start_time: "2026-08-01T10:00:00Z", end_time: "2026-08-01T10:30:00Z" },
      // This is the exact shape the webhook route now passes — a real UUID
      // conversation.id resolved via getOrCreateConversationByVapiCallId,
      // never the raw "call_abc123"-style Vapi call ID that used to be
      // passed directly and would have failed the conversation_id FK.
      { companyId: "comp-1", employeeId: "emp-1", conversationId: "11111111-1111-1111-1111-111111111111" }
    );

    expect(mockBookingRepo.createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ company_id: "comp-1", employee_id: "emp-1", lead_id: "lead-1" })
    );
    expect(result.success).toBe(true);
    expect(result.appointment_id).toBe("appt-1");
  });

  it("update_lead_qualification merges new signals with the existing lead and re-scores it", async () => {
    mockCrmRepo.getLeadById.mockResolvedValue({
      id: "lead-2",
      company_id: "comp-1",
      employee_id: "emp-1",
      name: "Cold Lead",
      email: "cold@example.com",
      phone: "+15550002222",
      budget: 100, // already on file from an earlier save_lead call (+20)
      score: 20,
      score_category: "LOW" as never,
      status: "NEW" as never,
      lead_temperature: "COLD" as never,
      nurture_status: "NONE" as never,
      tags: [],
      created_at: "",
      updated_at: "",
    });
    mockCrmRepo.updateLeadQualification.mockResolvedValue({
      id: "lead-2",
      company_id: "comp-1",
      employee_id: "emp-1",
      name: "Cold Lead",
      email: "cold@example.com",
      phone: "+15550002222",
      budget: 100,
      score: 45, // 20 (existing budget) + 10 (decision_maker yes) + 15 (buying_intent high)
      score_category: "MEDIUM" as never,
      status: "NEW" as never,
      lead_temperature: "WARM" as never,
      nurture_status: "NONE" as never,
      tags: [],
      created_at: "",
      updated_at: "",
    });

    const tool = toolRegistry.getTool("update_lead_qualification")!;
    const result = await tool.execute(
      { lead_id: "lead-2", decision_maker: "yes", buying_intent: "high" },
      { companyId: "comp-1", employeeId: "emp-1" }
    );

    // The existing budget (from the earlier save_lead call) must still be
    // read from the stored lead and carried into the re-score — this is
    // "dynamic stage two" refining a lead, not starting from a blank slate.
    expect(mockCrmRepo.updateLeadQualification).toHaveBeenCalledWith(
      "lead-2",
      expect.objectContaining({ score: 45, lead_temperature: "WARM" })
    );
    expect(result.success).toBe(true);
    expect(result.lead_temperature).toBe("WARM");
  });

  // Regression: the qualification directive explicitly tells the model to
  // mirror an accepted answer into update_lead_qualification's "notes"
  // field after EVERY question ("perceived usefulness -> notes") — but
  // qualification_notes is the SAME column get_next_qualification_question
  // appends each authored "Qn [YES|NO|MAYBE] (...): ..." line to, which the
  // booking UI's qualification-status endpoint parses to render progress
  // and decide completion. A flat overwrite here silently destroyed every
  // previously-recorded Qn line on a routine, directive-encouraged call —
  // not a rare edge case — which is what made a call that sounded complete
  // over voice render incomplete/stuck in the booking UI.
  it("update_lead_qualification APPENDS a new qualification_notes value instead of replacing the existing Qn answer history", async () => {
    mockCrmRepo.getLeadById.mockResolvedValue({
      id: "lead-7",
      company_id: "comp-1",
      employee_id: "emp-1",
      name: "Voice qualification visitor",
      email: "qualifying-conv-1@placeholder.maylaanai.internal",
      phone: "0000000000",
      qualification_notes: "Q1 [YES] (2026-08-14T10:00:00.000Z): Yes\nQ2 [NO] (2026-08-14T10:01:00.000Z): No",
      tags: [],
      created_at: "",
      updated_at: "",
    } as never);
    mockCrmRepo.updateLeadQualification.mockResolvedValue({} as never);

    const tool = toolRegistry.getTool("update_lead_qualification")!;
    await tool.execute(
      { lead_id: "lead-7", qualification_notes: "Visitor confirmed perceived usefulness" },
      { companyId: "comp-1", employeeId: "emp-1" }
    );

    const call = mockCrmRepo.updateLeadQualification.mock.calls[0][1] as Record<string, unknown>;
    expect(call.qualification_notes).toBe(
      "Q1 [YES] (2026-08-14T10:00:00.000Z): Yes\nQ2 [NO] (2026-08-14T10:01:00.000Z): No\nVisitor confirmed perceived usefulness"
    );
  });

  it("update_lead_qualification reports failure without throwing when the lead doesn't exist", async () => {
    mockCrmRepo.getLeadById.mockResolvedValue(null);
    const tool = toolRegistry.getTool("update_lead_qualification")!;
    const result = await tool.execute({ lead_id: "does-not-exist" }, { companyId: "comp-1", employeeId: "emp-1" });
    expect(result.success).toBe(false);
    expect(mockCrmRepo.updateLeadQualification).not.toHaveBeenCalled();
  });

  it("update_lead_qualification lets has_need be explicitly set to false, not just inferred from problem_statement", async () => {
    mockCrmRepo.getLeadById.mockResolvedValue({
      id: "lead-3",
      company_id: "comp-1",
      employee_id: "emp-1",
      name: "Maybe Lead",
      email: "maybe@example.com",
      phone: "+15550003333",
      problem_statement: "Wanted to compare pricing", // would infer hasNeed=true if not overridden
      tags: [],
      created_at: "",
      updated_at: "",
    } as never);
    mockCrmRepo.updateLeadQualification.mockResolvedValue({} as never);

    const tool = toolRegistry.getTool("update_lead_qualification")!;
    await tool.execute({ lead_id: "lead-3", has_need: false }, { companyId: "comp-1", employeeId: "emp-1" });

    const call = mockCrmRepo.updateLeadQualification.mock.calls[0][1] as Record<string, unknown>;
    expect(call.cold_reason).toBe("NEED_UNCLEAR");
  });

  it("update_lead_qualification preserves the existing has_need signal when a later call omits it entirely", async () => {
    // Second-stage call refining decision_maker only — has_need is not part
    // of this tool call's args at all (not even explicitly false), unlike
    // the test above. The lead already has a problem_statement on file from
    // save_lead, so hasNeed must still be inferred true and keep
    // contributing its +30, rather than silently reverting to "unknown".
    mockCrmRepo.getLeadById.mockResolvedValue({
      id: "lead-6",
      company_id: "comp-1",
      employee_id: "emp-1",
      name: "Returning Lead",
      email: "returning@example.com",
      phone: "+15550006666",
      problem_statement: "Needs a voice AI for lead intake",
      tags: [],
      created_at: "",
      updated_at: "",
    } as never);
    mockCrmRepo.updateLeadQualification.mockResolvedValue({} as never);

    const tool = toolRegistry.getTool("update_lead_qualification")!;
    await tool.execute({ lead_id: "lead-6", decision_maker: "yes" }, { companyId: "comp-1", employeeId: "emp-1" });

    const call = mockCrmRepo.updateLeadQualification.mock.calls[0][1] as Record<string, unknown>;
    // +30 (need) + 10 (decision_maker yes) = 40 — only reachable if hasNeed
    // survived being merged from problem_statement, not dropped to undefined.
    expect(call.score).toBe(40);
    expect(call.decision_maker).toBe("yes");
  });

  it("update_lead_qualification drops a hallucinated enum value instead of persisting or crashing", async () => {
    mockCrmRepo.getLeadById.mockResolvedValue({
      id: "lead-4",
      company_id: "comp-1",
      employee_id: "emp-1",
      name: "Odd Lead",
      email: "odd@example.com",
      phone: "+15550004444",
      decision_maker: "yes", // already on file
      tags: [],
      created_at: "",
      updated_at: "",
    } as never);
    mockCrmRepo.updateLeadQualification.mockResolvedValue({} as never);

    const tool = toolRegistry.getTool("update_lead_qualification")!;
    // "maybe" is not a valid decision_maker value — must not overwrite the
    // real "yes" already on file, and must not throw out of the tool call.
    const result = await tool.execute({ lead_id: "lead-4", decision_maker: "maybe" }, { companyId: "comp-1", employeeId: "emp-1" });

    expect(result.success).toBe(true);
    const call = mockCrmRepo.updateLeadQualification.mock.calls[0][1] as Record<string, unknown>;
    expect(call.decision_maker).toBe("yes");
  });

  describe("cold-lead nurture email", () => {
    let mockNotificationService: { send: jest.Mock };
    let registryWithNotifications: ToolRegistry;

    beforeEach(() => {
      mockNotificationService = { send: jest.fn().mockResolvedValue({ success: true }) };
      registryWithNotifications = new ToolRegistry(
        mockCrmRepo,
        mockBookingRepo,
        mockKnowledgeRepo,
        mockNotificationService as never
      );
      mockKnowledgeRepo.getEmployeeById.mockResolvedValue({
        id: "emp-1",
        company_id: "comp-1",
        name: "Srinivasan Kandasamy",
        designation: "Founder",
        email: "srinivasan@example.com",
        phone: "+15550003333",
        created_at: "",
        updated_at: "",
      } as never);
    });

    it("sends exactly one nurture email the first time a lead is classified COLD", async () => {
      mockCrmRepo.createLead.mockResolvedValue({
        id: "lead-3",
        company_id: "comp-1",
        employee_id: "emp-1",
        name: "Just Browsing",
        email: "browsing@example.com",
        phone: "+15550004444",
        score: 0,
        score_category: "LOW" as never,
        status: "NEW" as never,
        tags: [],
        created_at: "",
        updated_at: "",
      });
      mockCrmRepo.updateLeadQualification.mockResolvedValue({
        id: "lead-3",
        company_id: "comp-1",
        employee_id: "emp-1",
        name: "Just Browsing",
        email: "browsing@example.com",
        phone: "+15550004444",
        score: 0,
        score_category: "LOW" as never,
        status: "NEW" as never,
        lead_temperature: "COLD" as never,
        cold_reason: "BUDGET" as never,
        nurture_status: "QUEUED" as never,
        tags: [],
        created_at: "",
        updated_at: "",
      });

      const tool = registryWithNotifications.getTool("save_lead")!;
      await tool.execute(
        { name: "Just Browsing", email: "browsing@example.com", phone: "+15550004444" },
        { companyId: "comp-1", employeeId: "emp-1" }
      );

      // The nurture email is fire-and-forget (never blocks the tool
      // response) — flush the microtask queue so its async body settles
      // before asserting.
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockNotificationService.send).toHaveBeenCalledTimes(1);
      expect(mockNotificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: "browsing@example.com", templateName: "cold_lead_nurture" })
      );
      expect(mockCrmRepo.updateLeadQualification).toHaveBeenLastCalledWith("lead-3", { nurture_status: "SENT" });
    });

    it("never re-sends the nurture email for a lead that was already queued/sent", async () => {
      mockCrmRepo.getLeadById.mockResolvedValue({
        id: "lead-4",
        company_id: "comp-1",
        employee_id: "emp-1",
        name: "Still Cold",
        email: "stillcold@example.com",
        phone: "+15550005555",
        score: 0,
        score_category: "LOW" as never,
        status: "NEW" as never,
        lead_temperature: "COLD" as never,
        nurture_status: "SENT" as never, // already emailed once
        tags: [],
        created_at: "",
        updated_at: "",
      });
      mockCrmRepo.updateLeadQualification.mockResolvedValue({
        id: "lead-4",
        company_id: "comp-1",
        employee_id: "emp-1",
        name: "Still Cold",
        email: "stillcold@example.com",
        phone: "+15550005555",
        score: 0,
        score_category: "LOW" as never,
        status: "NEW" as never,
        lead_temperature: "COLD" as never,
        nurture_status: "SENT" as never,
        tags: [],
        created_at: "",
        updated_at: "",
      });

      const tool = registryWithNotifications.getTool("update_lead_qualification")!;
      await tool.execute({ lead_id: "lead-4", objections: "still thinking it over" }, { companyId: "comp-1", employeeId: "emp-1" });

      await new Promise((resolve) => setImmediate(resolve));

      expect(mockNotificationService.send).not.toHaveBeenCalled();
    });
  });
});
