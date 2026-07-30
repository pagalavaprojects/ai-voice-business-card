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
      listLeads: jest.fn(),
      softDeleteLead: jest.fn(),
    };

    mockBookingRepo = {
      createAppointment: jest.fn(),
      getAppointmentById: jest.fn(),
      getAppointmentsByEmployee: jest.fn(),
      updateAppointmentStatus: jest.fn(),
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
});
