export type WorkflowNodeType =
  | "START"
  | "CONDITION"
  | "WEBHOOK"
  | "RESEND_EMAIL"
  | "CALCOM_BOOKING"
  | "SLACK_NOTIFY"
  | "END";

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  label: string;
  config: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  conditionValue?: string;
}

export interface WorkflowExecutionResult {
  workflowId: string;
  success: boolean;
  executedNodeIds: string[];
  logs: string[];
}

export class WorkflowEngine {
  async executeWorkflow(
    workflowId: string,
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    initialContext: Record<string, unknown>
  ): Promise<WorkflowExecutionResult> {
    const executedNodeIds: string[] = [];
    const logs: string[] = [];

    const startNode = nodes.find((n) => n.type === "START");
    if (!startNode) {
      return { workflowId, success: false, executedNodeIds, logs: ["No START node found."] };
    }

    let currentNode: WorkflowNode | undefined = startNode;

    while (currentNode) {
      executedNodeIds.push(currentNode.id);
      logs.push(`Executing node [${currentNode.type}]: ${currentNode.label}`);

      if (currentNode.type === "END") break;

      // Find outgoing edge
      const outgoingEdges = edges.filter((e) => e.source === currentNode?.id);
      if (outgoingEdges.length === 0) break;

      // Select next node
      const nextEdge = outgoingEdges[0];
      currentNode = nodes.find((n) => n.id === nextEdge.target);
    }

    return {
      workflowId,
      success: true,
      executedNodeIds,
      logs,
    };
  }
}
