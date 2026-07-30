import { MultiAgentOrchestratorService } from "@/core/application/services/MultiAgentOrchestratorService";
import { WorkflowEngine } from "@/core/domain/workflow/WorkflowEngine";

describe("Multi-Agent Platform & Workflow Engine", () => {
  it("should route technical queries to Technical Support Agent", () => {
    const orchestrator = new MultiAgentOrchestratorService();
    const result = orchestrator.routeVisitorIntent("I have an issue with your REST API integration");

    expect(result.selectedAgent.department).toBe("TECHNICAL_SUPPORT");
    expect(result.confidenceScore).toBeGreaterThan(0.9);
  });

  it("should route commercial inquiries to Sales Agent", () => {
    const orchestrator = new MultiAgentOrchestratorService();
    const result = orchestrator.routeVisitorIntent("How much does your enterprise plan cost?");

    expect(result.selectedAgent.department).toBe("SALES");
  });

  it("should execute a DAG workflow graph cleanly", async () => {
    const engine = new WorkflowEngine();
    const nodes = [
      { id: "node-1", type: "START" as const, label: "Start", config: {} },
      { id: "node-2", type: "SLACK_NOTIFY" as const, label: "Notify Slack", config: {} },
      { id: "node-3", type: "END" as const, label: "End", config: {} },
    ];
    const edges = [
      { id: "edge-1", source: "node-1", target: "node-2" },
      { id: "edge-2", source: "node-2", target: "node-3" },
    ];

    const result = await engine.executeWorkflow("wf-1", nodes, edges, {});

    expect(result.success).toBe(true);
    expect(result.executedNodeIds).toEqual(["node-1", "node-2", "node-3"]);
  });
});
