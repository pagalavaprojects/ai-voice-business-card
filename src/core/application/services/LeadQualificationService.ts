import { ICRMRepository } from "../../domain/repositories/ICRMRepository";
import {
  Lead,
  LeadScoreCategory,
  LeadStatus,
  LeadTemperature,
  ColdReason,
  NurtureStatus,
  DecisionMakerStatus,
  Urgency,
  BuyingIntent,
  Sentiment,
  NurtureChannel,
} from "../../domain/models/types";

export interface QualificationParams {
  budget?: number;
  timeline?: string;
  hasNeed?: boolean;
  decisionMaker?: DecisionMakerStatus;
  urgency?: Urgency;
  buyingIntent?: BuyingIntent;
  objections?: string;
  currentSolution?: string;
  referralSource?: string;
  sentiment?: Sentiment;
  /** The AI's own confidence (0–1) in this qualification read — surfaced in
   * the CRM so a human can tell "the AI is sure this is cold" apart from
   * "the AI barely has enough to go on yet". Not used in scoring itself:
   * a low-confidence read shouldn't silently inflate or deflate the score,
   * it should just be visible as a caveat. */
  confidence?: number;
  conversationSummary?: string;
  qualificationNotes?: string;
}

const FOLLOWUP_WINDOW_DAYS: Record<ColdReason, number> = {
  [ColdReason.AUTHORITY]: 3, // chase down the real decision maker quickly
  [ColdReason.BUDGET]: 7,
  [ColdReason.TIMING]: 7,
  [ColdReason.NEED_UNCLEAR]: 14,
  [ColdReason.RESEARCH_PHASE]: 14,
};

const NURTURE_CHANNEL_BY_REASON: Record<ColdReason, NurtureChannel> = {
  [ColdReason.AUTHORITY]: "EMAIL", // ask them to loop in the actual decision maker
  [ColdReason.BUDGET]: "EMAIL",
  [ColdReason.TIMING]: "EMAIL",
  [ColdReason.NEED_UNCLEAR]: "CONTENT", // not ready for a sales conversation yet
  [ColdReason.RESEARCH_PHASE]: "CONTENT",
};

export class LeadQualificationService {
  constructor(private crmRepo: ICRMRepository) {}

  /** Scores a lead from whatever qualification signals have been gathered so
   * far — never all of them at once; the AI calls this again as the
   * conversation surfaces more (see ToolRegistry's save_lead and
   * update_lead_qualification tools). Persists in a single write via
   * updateLeadQualification, computing every business rule here (status
   * transitions, temperature, cold reason, nurture routing) so the
   * repository stays a thin persistence layer.
   */
  async calculateAndSaveLeadScore(leadId: string, params: QualificationParams): Promise<Lead> {
    const { score, reasons } = this.score(params);
    const category = this.categorize(score);
    const temperature = this.classifyTemperature(score, params);

    const patch: Partial<Lead> = {
      score,
      score_category: category,
      score_reasoning: reasons.join(", "),
      status: category === LeadScoreCategory.HIGH ? LeadStatus.QUALIFIED : LeadStatus.NEW,
      lead_temperature: temperature,
      decision_maker: params.decisionMaker,
      urgency: params.urgency,
      buying_intent: params.buyingIntent,
      objections: params.objections,
      current_solution: params.currentSolution,
      referral_source: params.referralSource,
      sentiment: params.sentiment,
      qualification_confidence: params.confidence,
      conversation_summary: params.conversationSummary,
      qualification_notes: params.qualificationNotes,
    };

    if (temperature === LeadTemperature.COLD) {
      const coldReason = this.deriveColdReason(params);
      patch.cold_reason = coldReason;
      patch.nurture_status = NurtureStatus.QUEUED;
      patch.nurture_channel_recommended = NURTURE_CHANNEL_BY_REASON[coldReason];
      const followupDate = new Date();
      followupDate.setDate(followupDate.getDate() + FOLLOWUP_WINDOW_DAYS[coldReason]);
      patch.next_followup_date = followupDate.toISOString();
    } else {
      // A lead that warms back up (re-engaged, budget clarified, etc.) is no
      // longer waiting on a nurture sequence — clear the stale routing
      // rather than leaving a HOT lead still marked "queued for nurture".
      patch.cold_reason = null;
      patch.nurture_status = NurtureStatus.NONE;
      patch.nurture_channel_recommended = null;
      patch.next_followup_date = null;
    }

    // Zod strips `undefined` fields at the API boundary already; here we're
    // constructing the patch directly, so drop undefined keys ourselves —
    // Supabase's `.update()` would otherwise happily write `column = NULL`
    // for a signal the AI simply hasn't gathered yet, silently erasing a
    // value a PREVIOUS call already recorded.
    for (const key of Object.keys(patch) as (keyof Lead)[]) {
      if (patch[key] === undefined) delete patch[key];
    }

    return this.crmRepo.updateLeadQualification(leadId, patch);
  }

  private score(params: QualificationParams): { score: number; reasons: string[] } {
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

    if (params.decisionMaker === "yes") {
      score += 10;
      reasons.push("Confirmed Decision Maker (+10)");
    } else if (params.decisionMaker === "shared") {
      score += 5;
      reasons.push("Shared Decision Authority (+5)");
    }

    if (params.urgency === "immediate") {
      score += 10;
      reasons.push("Immediate Urgency (+10)");
    }

    if (params.buyingIntent === "high") {
      score += 15;
      reasons.push("High Buying Intent (+15)");
    } else if (params.buyingIntent === "medium") {
      score += 5;
      reasons.push("Medium Buying Intent (+5)");
    }

    return { score: Math.min(100, score), reasons };
  }

  private categorize(score: number): LeadScoreCategory {
    if (score >= 70) return LeadScoreCategory.HIGH;
    if (score >= 40) return LeadScoreCategory.MEDIUM;
    return LeadScoreCategory.LOW;
  }

  /** Temperature is the qualitative read that actually drives what happens
   * next — booking vs. nurture — so an explicit "low buying intent" signal
   * from the AI overrides a favourable point total rather than the other
   * way around: someone can have budget and a rough timeline and still
   * clearly say "just researching for now," and that should route to
   * nurture, not a pushed booking. */
  private classifyTemperature(score: number, params: QualificationParams): LeadTemperature {
    if (params.buyingIntent === "low") return LeadTemperature.COLD;
    if (score >= 70) return LeadTemperature.HOT;
    if (params.decisionMaker === "no" || params.hasNeed === false) return LeadTemperature.COLD;
    if (score >= 40) return LeadTemperature.WARM;
    return LeadTemperature.COLD;
  }

  /** Checked in priority order — the goal is the single most useful thing a
   * human follow-up should address first, not an exhaustive list of every
   * gap. An explicit negative signal (decisionMaker === "no") outranks a
   * merely-missing one (no budget/timeline given yet). */
  private deriveColdReason(params: QualificationParams): ColdReason {
    if (params.decisionMaker === "no") return ColdReason.AUTHORITY;
    if (params.hasNeed === false) return ColdReason.NEED_UNCLEAR;
    if (params.buyingIntent === "low") return ColdReason.RESEARCH_PHASE;
    if (!params.budget || params.budget <= 0) return ColdReason.BUDGET;
    if (!params.timeline && params.urgency !== "immediate") return ColdReason.TIMING;
    return ColdReason.RESEARCH_PHASE;
  }
}
