import { ICRMRepository } from "../../domain/repositories/ICRMRepository";
import { Lead, LeadScoreCategory } from "../../domain/models/types";

export class LeadQualificationService {
  constructor(private crmRepo: ICRMRepository) {}

  async calculateAndSaveLeadScore(
    leadId: string,
    params: {
      budget?: number;
      timeline?: string;
      hasNeed?: boolean;
    }
  ): Promise<Lead> {
    let score = 0;
    const reasons: string[] = [];

    if (params.budget && params.budget >= 5000) {
      score += 40;
      reasons.push("Budget >= $5,000 (+40)");
    } else if (params.budget && params.budget > 0) {
      score += 20;
      reasons.push("Budget > $0 (+20)");
    }

    if (params.timeline && (params.timeline.includes("ASAP") || params.timeline.includes("1 month"))) {
      score += 30;
      reasons.push("Urgent Timeline (+30)");
    }

    if (params.hasNeed) {
      score += 30;
      reasons.push("Explicit Need Identified (+30)");
    }

    let category: LeadScoreCategory = LeadScoreCategory.LOW;
    if (score >= 70) {
      category = LeadScoreCategory.HIGH;
    } else if (score >= 40) {
      category = LeadScoreCategory.MEDIUM;
    }

    return await this.crmRepo.updateLeadScore(leadId, score, category, reasons.join(", "));
  }
}
