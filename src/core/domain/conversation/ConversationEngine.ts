import { IConversationRepository } from "../repositories/IConversationRepository";
import { ConversationStatus } from "../models/types";

export type ConversationState =
  | "Greeting"
  | "Discovery"
  | "Qualification"
  | "Recommendation"
  | "ObjectionHandling"
  | "Booking"
  | "Confirmation"
  | "EndCall";

export class ConversationEngine {
  private currentState: ConversationState = "Greeting";

  constructor(private conversationRepo: IConversationRepository) {}

  public getState(): ConversationState {
    return this.currentState;
  }

  public transitionTo(newState: ConversationState) {
    this.currentState = newState;
  }

  public async handleUserMessage(conversationId: string, messageContent: string): Promise<void> {
    // 1. Record incoming user message
    await this.conversationRepo.addMessage(conversationId, "user", messageContent);

    // 2. Simple state progression heuristic based on message content
    const lower = messageContent.toLowerCase();
    if (lower.includes("price") || lower.includes("cost") || lower.includes("service")) {
      this.currentState = "Recommendation";
    } else if (lower.includes("book") || lower.includes("schedule") || lower.includes("call")) {
      this.currentState = "Booking";
    } else if (lower.includes("bye") || lower.includes("thank")) {
      this.currentState = "EndCall";
    } else if (this.currentState === "Greeting") {
      this.currentState = "Discovery";
    }
  }

  public async recordAssistantMessage(
    conversationId: string,
    messageContent: string,
    toolCalls?: Record<string, unknown>
  ): Promise<void> {
    await this.conversationRepo.addMessage(conversationId, "assistant", messageContent, toolCalls);
  }
}
