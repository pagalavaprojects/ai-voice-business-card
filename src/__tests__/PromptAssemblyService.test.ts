import { PromptAssemblyService } from "@/core/application/services/PromptAssemblyService";
import { IKnowledgeRepository } from "@/core/domain/repositories/IKnowledgeRepository";
import { IPromptRepository } from "@/core/domain/repositories/IPromptRepository";

describe("PromptAssemblyService", () => {
  let mockKnowledgeRepo: jest.Mocked<IKnowledgeRepository>;
  let mockPromptRepo: jest.Mocked<IPromptRepository>;
  let promptService: PromptAssemblyService;

  beforeEach(() => {
    mockKnowledgeRepo = {
      getCompanyById: jest.fn(),
      getEmployeeById: jest.fn(),
      getProductsByCompany: jest.fn(),
      getServicesByCompany: jest.fn(),
      getFAQsByCompany: jest.fn(),
      searchFAQs: jest.fn(),
      searchProducts: jest.fn(),
    };

    mockPromptRepo = {
      getPromptTemplates: jest.fn(),
      getPromptTemplateById: jest.fn(),
      getPromptTemplateByModule: jest.fn(),
      upsertPromptTemplate: jest.fn(),
      listVersions: jest.fn(),
      rollbackToVersion: jest.fn(),
    };

    promptService = new PromptAssemblyService(mockKnowledgeRepo, mockPromptRepo);
  });

  it("should assemble system prompt dynamically with company, employee, and products", async () => {
    mockKnowledgeRepo.getCompanyById.mockResolvedValue({
      id: "comp-1",
      name: "Acme Corp",
      website: "https://acme.com",
      created_at: "",
      updated_at: "",
    });

    mockKnowledgeRepo.getEmployeeById.mockResolvedValue({
      id: "emp-1",
      company_id: "comp-1",
      name: "Alice Smith",
      designation: "Head of Sales",
      phone: "+123456",
      email: "alice@acme.com",
      created_at: "",
      updated_at: "",
    });

    mockKnowledgeRepo.getProductsByCompany.mockResolvedValue([
      {
        id: "prod-1",
        company_id: "comp-1",
        name: "Enterprise CRM",
        description: "Cloud CRM for teams",
        features: ["Automation"],
        benefits: ["Scalability"],
        pricing: 499,
        currency: "USD",
        created_at: "",
        updated_at: "",
      },
    ]);

    mockKnowledgeRepo.getServicesByCompany.mockResolvedValue([]);
    mockKnowledgeRepo.getFAQsByCompany.mockResolvedValue([]);
    mockPromptRepo.getPromptTemplates.mockResolvedValue([]);

    const prompt = await promptService.assembleSystemPrompt("comp-1", "emp-1");

    expect(prompt).toContain("Alice Smith");
    expect(prompt).toContain("Head of Sales");
    expect(prompt).toContain("Acme Corp");
    expect(prompt).toContain("Enterprise CRM");
    expect(prompt).toContain("$499");
  });
});
