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
      getLeadByEmail: jest.fn(),
      updateLeadScore: jest.fn(),
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
      getAppointmentsByLead: jest.fn(),
      listAppointments: jest.fn(),
      updateAppointmentStatus: jest.fn(),
      rescheduleAppointment: jest.fn(),
      cancelAppointment: jest.fn(),
    };

    mockKnowledgeRepo = {
      getCompanyById: jest.fn(),
      getEmployeeById: jest.fn(),
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
    mockCrmRepo.updateLeadScore.mockResolvedValue({
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
    // updateLeadScore — every lead stayed at score 0/LOW forever.
    expect(mockCrmRepo.updateLeadScore).toHaveBeenCalledWith("lead-1", 100, "HIGH", expect.stringContaining("Budget >= $5,000"));
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
});
