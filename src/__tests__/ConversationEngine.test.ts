import { ConversationEngine } from "@/core/domain/conversation/ConversationEngine";
import { IConversationRepository } from "@/core/domain/repositories/IConversationRepository";

describe("ConversationEngine", () => {
  let mockConversationRepo: jest.Mocked<IConversationRepository>;
  let engine: ConversationEngine;

  beforeEach(() => {
    mockConversationRepo = {
      createConversation: jest.fn(),
      getConversationById: jest.fn(),
      getOrCreateConversationByVapiCallId: jest.fn(),
      getOrCreateConversationByWhatsAppSender: jest.fn(),
      setWhatsAppPendingQuestion: jest.fn(),
      setConversationLanguage: jest.fn(),
      appendToolCalled: jest.fn(),
      addMessage: jest.fn(),
      getMessages: jest.fn(),
      endConversation: jest.fn(),
    };

    engine = new ConversationEngine(mockConversationRepo);
  });

  it("should start in Greeting state and transition to Recommendation when price is asked", async () => {
    expect(engine.getState()).toBe("Greeting");

    await engine.handleUserMessage("conv-1", "How much does your enterprise service cost?");

    expect(mockConversationRepo.addMessage).toHaveBeenCalledWith("conv-1", "user", expect.any(String));
    expect(engine.getState()).toBe("Recommendation");
  });

  it("should transition to Booking state when scheduling is requested", async () => {
    await engine.handleUserMessage("conv-1", "I would like to book a call with your sales team");

    expect(engine.getState()).toBe("Booking");
  });
});
