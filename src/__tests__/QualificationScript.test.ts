/**
 * The 2026-08-13 authored questionnaire is THE single authoritative
 * qualification script (product-owner final decision, replaces the earlier
 * 17-question Tamil/English dual script). These tests pin the exact
 * wording (any future "improvement" fails loudly), that there are exactly
 * six questions with no gaps, the call opening (exactly Q1, no preamble,
 * no generic greeting), and the directive's contract with the server
 * sequencing tool — including that the AI is explicitly forbidden from
 * falling back to "How can I help you?" or any equivalent.
 */
import {
  QUALIFICATION_QUESTIONS,
  QUALIFICATION_CALL_OPENING,
  QUALIFICATION_ANSWER_GUIDANCE,
  QUALIFICATION_CONTINUE_PROMPT,
  ALL_QUESTIONS,
  classifyClosedResponse,
  getAuthoredQuestion,
  getQualificationDirective,
  matchAuthoredQuestion,
  withAnswerGuidance,
} from "@/features/voice/lib/qualificationScript";

describe("authored questionnaire (2026-08-13 revision — six questions, English only)", () => {
  it("pins all six questions verbatim, in order", () => {
    expect(ALL_QUESTIONS).toEqual([
      "Is our service or product something you need immediately?",
      "Have you set aside a specific budget for this already?",
      "Do you believe our service or product will be useful for your business?",
      "Is there anything holding you back — for example, price or timing?",
      "Are you ready to decide today?",
      "Shall I show you our calendar now, so we can book a convenient time to move this forward?",
    ]);
  });

  it("has exactly six questions, numbered 1-6 contiguously — no gaps, no Q7+", () => {
    expect(QUALIFICATION_QUESTIONS).toHaveLength(6);
    expect(QUALIFICATION_QUESTIONS.map((q) => q.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(getAuthoredQuestion(7)).toBeNull();
    expect(getAuthoredQuestion(13)).toBeNull();
    expect(getAuthoredQuestion(17)).toBeNull();
    expect(getAuthoredQuestion(0)).toBeNull();
  });

  it("every derived structure comes from the one master list", () => {
    expect(ALL_QUESTIONS).toEqual(QUALIFICATION_QUESTIONS.map((q) => q.question));
    expect(new Set(ALL_QUESTIONS).size).toBe(6);
  });

  it("the sixth question is the calendar-consent question", () => {
    expect(QUALIFICATION_QUESTIONS[5].question).toBe("Shall I show you our calendar now, so we can book a convenient time to move this forward?");
  });

  describe("call opening (what plays after Start AI Conversation)", () => {
    it("STARTS with Question 1 exactly, followed only by the closed-answer guidance", () => {
      expect(QUALIFICATION_CALL_OPENING.startsWith(QUALIFICATION_QUESTIONS[0].question)).toBe(true);
      expect(QUALIFICATION_CALL_OPENING).toBe(withAnswerGuidance(QUALIFICATION_QUESTIONS[0].question));
      expect(QUALIFICATION_CALL_OPENING).toBe(
        "Is our service or product something you need immediately?\n\nPlease answer with Yes, No, or Maybe."
      );
    });

    it("pins the guidance line verbatim", () => {
      expect(QUALIFICATION_ANSWER_GUIDANCE).toBe("Please answer with Yes, No, or Maybe.");
    });

    it("contains no forbidden openers, generic greetings, or pitch content", () => {
      for (const forbidden of [
        "Hello",
        "Welcome",
        "founder",
        "Business Card",
        "Elevator",
        "Pitch",
        "USP",
        "How can I help",
        "How may I help",
        "What can I help",
      ]) {
        expect(QUALIFICATION_CALL_OPENING).not.toContain(forbidden);
      }
    });
  });

  it("pins the exact Continue-button voice instruction", () => {
    expect(QUALIFICATION_CONTINUE_PROMPT).toBe("Please Click to Continue");
  });

  describe("classifyClosedResponse — the SERVER-side closed-answer gate", () => {
    it("yes → YES, no → NO, maybe → MAYBE (case-insensitive)", () => {
      expect(classifyClosedResponse("yes")).toBe("YES");
      expect(classifyClosedResponse("Yes")).toBe("YES");
      expect(classifyClosedResponse("no")).toBe("NO");
      expect(classifyClosedResponse("No")).toBe("NO");
      expect(classifyClosedResponse("maybe")).toBe("MAYBE");
      expect(classifyClosedResponse("Maybe")).toBe("MAYBE");
    });

    it("normalizes obvious ASR/spelling variation: punctuation, repetition, common variants", () => {
      expect(classifyClosedResponse("yes.")).toBe("YES");
      expect(classifyClosedResponse("yeah")).toBe("YES");
      expect(classifyClosedResponse("yep")).toBe("YES");
      expect(classifyClosedResponse("yes yes")).toBe("YES");
      expect(classifyClosedResponse(" nope ")).toBe("NO");
      expect(classifyClosedResponse("nah")).toBe("NO");
      expect(classifyClosedResponse("maybe.")).toBe("MAYBE");
    });

    it("rejects arbitrary sentences that merely contain a permitted word — no arbitrary natural language", () => {
      for (const invalid of ["we have a problem", "yes we have a problem", "yes, we do", "I don't know", "sure", "maybe later"]) {
        expect(classifyClosedResponse(invalid)).toBeNull();
      }
    });

    it("rejects empty/whitespace and mixed-class utterances — never invents a classification", () => {
      expect(classifyClosedResponse("")).toBeNull();
      expect(classifyClosedResponse("   ")).toBeNull();
      expect(classifyClosedResponse("yes no")).toBeNull();
    });
  });

  describe("matchAuthoredQuestion", () => {
    it("maps drifted transcripts back to the exact authored wording for all six questions, case-insensitively", () => {
      for (const q of ALL_QUESTIONS) {
        expect(matchAuthoredQuestion(`  ${q.replace("?", "").toUpperCase()} `)).toBe(q);
      }
    });

    it("still matches when the closed-answer guidance is spoken after the question", () => {
      for (const q of ALL_QUESTIONS) {
        expect(matchAuthoredQuestion(`${q}\n\nPlease answer with Yes, No, or Maybe.`)).toBe(q);
      }
    });

    it("returns null for non-question chatter, generic greetings, the bare guidance, and empty input", () => {
      expect(matchAuthoredQuestion("Thanks, that's a great answer.")).toBeNull();
      expect(matchAuthoredQuestion("How can I help you?")).toBeNull();
      expect(matchAuthoredQuestion("Please answer with Yes, No, or Maybe.")).toBeNull();
      expect(matchAuthoredQuestion("")).toBeNull();
    });
  });

  describe("getQualificationDirective", () => {
    const directive = getQualificationDirective();

    it("embeds every authored question with its real number, exactly six, no 7+", () => {
      for (const { number, question } of QUALIFICATION_QUESTIONS) {
        expect(directive).toContain(`${number}. ${question}`);
      }
      expect(directive).not.toMatch(/\n7\. /);
      expect(directive).not.toMatch(/\n13\. /);
      expect(directive).not.toMatch(/\n17\. /);
    });

    it("mandates the closed-ended tool contract: raw reply, SERVER classification, tool-driven progression", () => {
      expect(directive).toContain("STRICT CLOSED-ENDED questionnaire");
      expect(directive).toContain(QUALIFICATION_ANSWER_GUIDANCE);
      expect(directive).toContain("user_response");
      expect(directive).toContain("the SERVER decides");
      expect(directive).toContain("You do NOT classify");
      expect(directive).toContain("get_next_qualification_question");
      expect(directive).toContain("never invent a classification");
      expect(directive).toContain("never skip a question it returned");
    });

    it("bans preamble/pitch replay and mandates the reprompt loop on invalid answers", () => {
      expect(directive).toContain("ALREADY asked question 1");
      expect(directive).toContain("Never replay the founder pitch");
      expect(directive).toContain('action "reprompt"');
      expect(directive).toContain("stay on the SAME question");
      expect(directive).toContain("Never advance past an unaccepted answer");
    });

    it("explicitly forbids the generic assistant greeting — the qualification flow is proactive, never 'How can I help you?'", () => {
      expect(directive).toContain("How can I help you?");
      expect(directive).toContain("How may I help you?");
      expect(directive).toContain("What can I help you with?");
      expect(directive).toContain("NEVER greet the visitor with a generic assistant opener");
      expect(directive).toMatch(/even\s+if the visitor's first message is only "Hi"/);
    });

    it("never mentions Tamil script — this is the single, English-only qualification directive", () => {
      expect(directive).not.toMatch(/[஀-௿]/); // Tamil Unicode block
    });

    it("gives the exact Continue-button instruction on completion, never a paraphrase", () => {
      expect(directive).toContain(`say EXACTLY: "${QUALIFICATION_CONTINUE_PROMPT}"`);
      expect(directive).toContain("never paraphrase this");
    });
  });
});
