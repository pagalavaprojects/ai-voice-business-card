import { AIAgent, IntentRoutingResult, AgentDepartment } from "@/core/domain/agent/AIAgent";

export class MultiAgentOrchestratorService {
  private registeredAgents: Map<string, AIAgent> = new Map();

  constructor() {
    this.initializeDefaultFleet();
  }

  private initializeDefaultFleet() {
    // 1. Sales Agent
    this.registerAgent({
      id: "agent-sales-1",
      company_id: "default-company",
      department: "SALES",
      name: "Sarah Connor (Sales)",
      voice_model_id: "vapi-sales",
      personality_prompt: "You are an expert sales representative. Focus on product value, pricing, and lead qualification.",
      capabilities: ["search_products", "save_lead", "book_appointment"],
      escalation_threshold: 0.7,
      is_active: true,
      status: "ACTIVE",
      tools: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // 2. Technical Support Agent
    this.registerAgent({
      id: "agent-support-1",
      company_id: "default-company",
      department: "TECHNICAL_SUPPORT",
      name: "Alex Vance (Tech Support)",
      voice_model_id: "vapi-tech",
      personality_prompt: "You are a senior technical consultant. Answer API, SDK, and integration questions precisely.",
      capabilities: ["search_faqs", "get_company_information"],
      escalation_threshold: 0.65,
      is_active: true,
      status: "ACTIVE",
      tools: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // 3. Recruiter Agent
    this.registerAgent({
      id: "agent-recruiter-1",
      company_id: "default-company",
      department: "RECRUITER",
      name: "Elena Rostova (Recruiter)",
      voice_model_id: "vapi-hr",
      personality_prompt: "You are an executive talent recruiter. Engage candidates and collect career backgrounds.",
      capabilities: ["save_lead"],
      escalation_threshold: 0.75,
      is_active: true,
      status: "ACTIVE",
      tools: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  public registerAgent(agent: AIAgent) {
    this.registeredAgents.set(agent.id, agent);
  }

  public routeVisitorIntent(userQuery: string): IntentRoutingResult {
    const queryLower = userQuery.toLowerCase();

    if (queryLower.includes("api") || queryLower.includes("sdk") || queryLower.includes("bug") || queryLower.includes("integration")) {
      const supportAgent = Array.from(this.registeredAgents.values()).find((a) => a.department === "TECHNICAL_SUPPORT");
      return {
        selectedAgent: supportAgent || Array.from(this.registeredAgents.values())[0],
        confidenceScore: 0.95,
        reasoning: "Matched technical support keywords (api, sdk, integration).",
        requiresHumanEscalation: false,
      };
    }

    if (queryLower.includes("job") || queryLower.includes("career") || queryLower.includes("hiring") || queryLower.includes("apply")) {
      const recruiterAgent = Array.from(this.registeredAgents.values()).find((a) => a.department === "RECRUITER");
      return {
        selectedAgent: recruiterAgent || Array.from(this.registeredAgents.values())[0],
        confidenceScore: 0.92,
        reasoning: "Matched recruitment keywords (job, career, hiring).",
        requiresHumanEscalation: false,
      };
    }

    // Default to Sales Agent
    const salesAgent = Array.from(this.registeredAgents.values()).find((a) => a.department === "SALES") || Array.from(this.registeredAgents.values())[0];
    return {
      selectedAgent: salesAgent,
      confidenceScore: 0.88,
      reasoning: "General commercial inquiry routed to Sales Agent.",
      requiresHumanEscalation: false,
    };
  }

  public getAllAgents(): AIAgent[] {
    return Array.from(this.registeredAgents.values());
  }
}
