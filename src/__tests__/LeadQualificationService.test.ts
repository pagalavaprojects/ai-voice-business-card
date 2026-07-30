import { LeadQualificationService } from "@/core/application/services/LeadQualificationService";
import { ICRMRepository } from "@/core/domain/repositories/ICRMRepository";
import { Lead, LeadScoreCategory, LeadStatus } from "@/core/domain/models/types";

describe("LeadQualificationService", () => {
  let mockCrmRepo: jest.Mocked<ICRMRepository>;
  let qualificationService: LeadQualificationService;

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

    qualificationService = new LeadQualificationService(mockCrmRepo);
  });

  it("should score lead as HIGH when budget >= 5000 and timeline is urgent", async () => {
    const mockUpdatedLead: Lead = {
      id: "lead-123",
      company_id: "comp-123",
      employee_id: "emp-123",
      name: "John Doe",
      email: "john@example.com",
      phone: "+1234567890",
      score: 70,
      score_category: LeadScoreCategory.HIGH,
      score_reasoning: "Budget >= $5,000 (+40), Urgent Timeline (+30)",
      status: LeadStatus.QUALIFIED,
      tags: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    mockCrmRepo.updateLeadScore.mockResolvedValue(mockUpdatedLead);

    const result = await qualificationService.calculateAndSaveLeadScore("lead-123", {
      budget: 10000,
      timeline: "ASAP",
      hasNeed: false,
    });

    expect(mockCrmRepo.updateLeadScore).toHaveBeenCalledWith(
      "lead-123",
      70,
      LeadScoreCategory.HIGH,
      expect.stringContaining("Budget >= $5,000")
    );
    expect(result.score_category).toBe(LeadScoreCategory.HIGH);
  });

  it("should score lead as LOW when budget and timeline are missing", async () => {
    const mockUpdatedLead: Lead = {
      id: "lead-123",
      company_id: "comp-123",
      employee_id: "emp-123",
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "+1234567890",
      score: 0,
      score_category: LeadScoreCategory.LOW,
      score_reasoning: "",
      status: LeadStatus.NEW,
      tags: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    mockCrmRepo.updateLeadScore.mockResolvedValue(mockUpdatedLead);

    const result = await qualificationService.calculateAndSaveLeadScore("lead-123", {
      hasNeed: false,
    });

    expect(mockCrmRepo.updateLeadScore).toHaveBeenCalledWith("lead-123", 0, LeadScoreCategory.LOW, "");
    expect(result.score_category).toBe(LeadScoreCategory.LOW);
  });
});
