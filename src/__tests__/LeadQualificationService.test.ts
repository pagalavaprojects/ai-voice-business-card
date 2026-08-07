import { LeadQualificationService } from "@/core/application/services/LeadQualificationService";
import { ICRMRepository } from "@/core/domain/repositories/ICRMRepository";
import { Lead, LeadScoreCategory, LeadStatus, LeadTemperature, ColdReason, NurtureStatus } from "@/core/domain/models/types";

describe("LeadQualificationService", () => {
  let mockCrmRepo: jest.Mocked<ICRMRepository>;
  let qualificationService: LeadQualificationService;

  const baseLead: Lead = {
    id: "lead-123",
    company_id: "comp-123",
    employee_id: "emp-123",
    name: "John Doe",
    email: "john@example.com",
    phone: "+1234567890",
    score: 0,
    score_category: LeadScoreCategory.LOW,
    status: LeadStatus.NEW,
    tags: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    mockCrmRepo = {
      createLead: jest.fn(),
      getLeadById: jest.fn(),
      getLeadByEmail: jest.fn(),
      updateLeadScore: jest.fn(),
      updateLeadQualification: jest.fn((_id, patch) => Promise.resolve({ ...baseLead, ...patch } as Lead)),
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
    const result = await qualificationService.calculateAndSaveLeadScore("lead-123", {
      budget: 10000,
      timeline: "ASAP",
      hasNeed: false,
    });

    expect(mockCrmRepo.updateLeadQualification).toHaveBeenCalledWith(
      "lead-123",
      expect.objectContaining({
        score: 70,
        score_category: LeadScoreCategory.HIGH,
        score_reasoning: expect.stringContaining("Budget >= $5,000"),
        status: LeadStatus.QUALIFIED,
        lead_temperature: LeadTemperature.HOT,
      })
    );
    expect(result.score_category).toBe(LeadScoreCategory.HIGH);
  });

  it("should score lead as LOW/COLD when budget and timeline are missing", async () => {
    await qualificationService.calculateAndSaveLeadScore("lead-123", {
      hasNeed: false,
    });

    expect(mockCrmRepo.updateLeadQualification).toHaveBeenCalledWith(
      "lead-123",
      expect.objectContaining({ score: 0, score_category: LeadScoreCategory.LOW, lead_temperature: LeadTemperature.COLD })
    );
  });

  it("never calls updateLeadScore directly — qualification is a single atomic write", async () => {
    await qualificationService.calculateAndSaveLeadScore("lead-123", { budget: 10000 });
    expect(mockCrmRepo.updateLeadScore).not.toHaveBeenCalled();
  });

  describe("temperature classification", () => {
    it("classifies HOT when score >= 70", async () => {
      await qualificationService.calculateAndSaveLeadScore("lead-123", {
        budget: 10000,
        timeline: "ASAP",
        hasNeed: true,
      });
      expect(mockCrmRepo.updateLeadQualification).toHaveBeenCalledWith(
        "lead-123",
        expect.objectContaining({ lead_temperature: LeadTemperature.HOT })
      );
    });

    it("classifies WARM when score is 40-69", async () => {
      await qualificationService.calculateAndSaveLeadScore("lead-123", { budget: 100 }); // +20
      const call = mockCrmRepo.updateLeadQualification.mock.calls[0][1] as Partial<Lead>;
      expect(call.score).toBe(20);
      expect(call.lead_temperature).toBe(LeadTemperature.COLD); // 20 is still COLD, not WARM

      mockCrmRepo.updateLeadQualification.mockClear();
      await qualificationService.calculateAndSaveLeadScore("lead-123", { budget: 100, decisionMaker: "yes", urgency: "immediate" }); // 20+10+10 = 40
      expect(mockCrmRepo.updateLeadQualification).toHaveBeenCalledWith(
        "lead-123",
        expect.objectContaining({ score: 40, lead_temperature: LeadTemperature.WARM })
      );
    });

    it("an explicit low buying_intent overrides a high point score and forces COLD", async () => {
      await qualificationService.calculateAndSaveLeadScore("lead-123", {
        budget: 10000,
        timeline: "ASAP",
        hasNeed: true,
        buyingIntent: "low",
      });
      expect(mockCrmRepo.updateLeadQualification).toHaveBeenCalledWith(
        "lead-123",
        expect.objectContaining({ lead_temperature: LeadTemperature.COLD })
      );
    });

    it("high buying_intent adds to the score", async () => {
      const withoutIntent = await qualificationService.calculateAndSaveLeadScore("lead-123", { budget: 100 });
      mockCrmRepo.updateLeadQualification.mockClear();
      const withIntent = await qualificationService.calculateAndSaveLeadScore("lead-123", { budget: 100, buyingIntent: "high" });
      expect(withIntent.score).toBe(withoutIntent.score + 15);
    });
  });

  describe("cold-lead nurture routing", () => {
    it("assigns cold_reason BUDGET when no budget was captured", async () => {
      await qualificationService.calculateAndSaveLeadScore("lead-123", { hasNeed: true, timeline: "next quarter" });
      expect(mockCrmRepo.updateLeadQualification).toHaveBeenCalledWith(
        "lead-123",
        expect.objectContaining({ cold_reason: ColdReason.BUDGET, nurture_status: NurtureStatus.QUEUED })
      );
    });

    it("assigns cold_reason AUTHORITY when the visitor is explicitly not the decision maker", async () => {
      await qualificationService.calculateAndSaveLeadScore("lead-123", {
        budget: 100,
        hasNeed: true,
        decisionMaker: "no",
      });
      const call = mockCrmRepo.updateLeadQualification.mock.calls[0][1] as Partial<Lead>;
      expect(call.cold_reason).toBe(ColdReason.AUTHORITY);
      expect(call.nurture_channel_recommended).toBe("EMAIL");
    });

    it("assigns cold_reason NEED_UNCLEAR when budget and timeline exist but no need was expressed", async () => {
      // buyingIntent: "low" forces COLD despite the point total (score=50,
      // which alone would land WARM) — an explicit low-intent read overrides
      // the arithmetic, same as the temperature-classification test above.
      await qualificationService.calculateAndSaveLeadScore("lead-123", {
        budget: 100,
        timeline: "ASAP",
        hasNeed: false,
        buyingIntent: "low",
      });
      expect(mockCrmRepo.updateLeadQualification).toHaveBeenCalledWith(
        "lead-123",
        expect.objectContaining({ cold_reason: ColdReason.NEED_UNCLEAR, nurture_channel_recommended: "CONTENT" })
      );
    });

    it("sets a next_followup_date for cold leads and clears nurture fields for warm/hot leads", async () => {
      const cold = await qualificationService.calculateAndSaveLeadScore("lead-123", { hasNeed: false });
      expect(cold.next_followup_date).toBeTruthy();

      mockCrmRepo.updateLeadQualification.mockClear();
      await qualificationService.calculateAndSaveLeadScore("lead-123", { budget: 10000, timeline: "ASAP", hasNeed: true });
      expect(mockCrmRepo.updateLeadQualification).toHaveBeenCalledWith(
        "lead-123",
        expect.objectContaining({ cold_reason: null, nurture_status: NurtureStatus.NONE, next_followup_date: null })
      );
    });
  });

  it("never writes undefined fields into the patch (would null out a previously-recorded signal)", async () => {
    await qualificationService.calculateAndSaveLeadScore("lead-123", { budget: 100 });
    const patch = mockCrmRepo.updateLeadQualification.mock.calls[0][1] as Record<string, unknown>;
    expect("decision_maker" in patch).toBe(false);
    expect("objections" in patch).toBe(false);
  });
});
