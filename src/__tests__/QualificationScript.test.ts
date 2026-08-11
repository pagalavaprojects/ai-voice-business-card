/**
 * The 2026-08-10 authored questionnaire is source-of-truth: these tests
 * pin the exact wording (any future "improvement" fails loudly), the Q13
 * gap, the call opening (exactly Q1, no preamble), and the directive's
 * contract with the server sequencing tool.
 */
import {
  TAMIL_QUALIFICATION_INTRO,
  TAMIL_QUALIFICATION_CALL_OPENING,
  TAMIL_QUALIFICATION_QUESTIONS,
  TAMIL_QUALIFICATION_SET1,
  TAMIL_QUALIFICATION_SET2,
  TAMIL_ANSWER_GUIDANCE,
  ALL_TAMIL_QUESTIONS,
  classifyClosedTamilResponse,
  getAuthoredQuestion,
  getTamilQualificationDirective,
  withAnswerGuidance,
  ENGLISH_QUALIFICATION_CALL_OPENING,
  ENGLISH_QUALIFICATION_QUESTIONS,
  ENGLISH_QUALIFICATION_SET1,
  ENGLISH_QUALIFICATION_SET2,
  ENGLISH_ANSWER_GUIDANCE,
  ALL_ENGLISH_QUESTIONS,
  classifyClosedEnglishResponse,
  getAuthoredEnglishQuestion,
  getEnglishQualificationDirective,
  matchAuthoredEnglishQuestion,
  isQualificationSupportedLanguage,
} from "@/features/voice/lib/qualificationScript";

describe("authored questionnaire (2026-08-10 revision)", () => {
  it("pins Set 1 verbatim", () => {
    expect(TAMIL_QUALIFICATION_SET1).toEqual([
      "உங்கள் வணிகத்தில் தீர்வு காண வேண்டிய குறிப்பிட்ட பிரச்சினை உள்ளதா?",
      "இந்தப் பிரச்சினை 3 மாதங்களுக்கு மேல் உள்ளதா?",
      "இதற்கு முன் வேறு தீர்வு முயற்சி செய்தீர்களா?",
      "இந்த முடிவை தாங்கள் மட்டும் எடுக்க முடியுமா?",
      "தாங்கள் நினைத்திருக்கும் தொகை எங்கள் விலை வரம்பிற்குள் உள்ளதா?",
      "இதை இந்த மாதத்திற்குள் தொடங்க எண்ணியுள்ளீர்களா?",
      "இது தங்களுக்கு இப்போதே தேவையானதா?",
    ]);
  });

  it("pins Set 2 verbatim — 9 questions, no Q13", () => {
    expect(TAMIL_QUALIFICATION_SET2).toEqual([
      "இந்தத் தீர்வு உங்கள் வணிகத்திற்கு பயனுள்ளதாக இருக்கும் என நினைக்கிறீர்களா?",
      "தரம்/வேகம் தங்களுக்கு விலையை விட முக்கியமா?",
      "முன்னேற தங்களைத் தடுக்கும் ஏதேனும் காரணம் உள்ளதா?",
      "அது விலை தொடர்பானதா?",
      "இன்றே முடிவெடுக்க தாங்கள் தயாரா?",
      "இது ஒரு பரிந்துரையின் மூலம் வந்ததா?",
      "உங்கள் பகுதியில் உள்ள வாடிக்கையாளர்களுடன் இணைக்க விரும்புகிறீர்களா?",
      "இப்போது, இதை முன்னெடுத்துச் செல்ல, தங்கள் வசதிக்கேற்ப ஒரு நேரத்தைப் பதிவு செய்ய எங்கள் காலெண்டரைக் காட்டட்டுமா?",
      "இவ்வாறு தொடரலாமா?",
    ]);
  });

  it("Q13 does not exist anywhere", () => {
    expect(getAuthoredQuestion(13)).toBeNull();
    expect(TAMIL_QUALIFICATION_QUESTIONS.some((q) => q.number === 13)).toBe(false);
    expect(ALL_TAMIL_QUESTIONS).toHaveLength(16);
  });

  it("every derived structure comes from the one master list", () => {
    expect(TAMIL_QUALIFICATION_SET1).toEqual(TAMIL_QUALIFICATION_QUESTIONS.filter((q) => q.number <= 7).map((q) => q.question));
    expect(TAMIL_QUALIFICATION_SET2).toEqual(TAMIL_QUALIFICATION_QUESTIONS.filter((q) => q.number >= 8).map((q) => q.question));
    expect(ALL_TAMIL_QUESTIONS).toEqual(TAMIL_QUALIFICATION_QUESTIONS.map((q) => q.question));
    expect(new Set(ALL_TAMIL_QUESTIONS).size).toBe(16);
  });

  describe("call opening (what plays after Start AI Conversation)", () => {
    it("STARTS with Question 1 exactly, followed only by the closed-answer guidance", () => {
      expect(TAMIL_QUALIFICATION_CALL_OPENING.startsWith(TAMIL_QUALIFICATION_SET1[0])).toBe(true);
      expect(TAMIL_QUALIFICATION_CALL_OPENING).toBe(withAnswerGuidance(TAMIL_QUALIFICATION_SET1[0]));
      expect(TAMIL_QUALIFICATION_CALL_OPENING).toBe(
        "உங்கள் வணிகத்தில் தீர்வு காண வேண்டிய குறிப்பிட்ட பிரச்சினை உள்ளதா?\n\nஆம், இல்லை அல்லது இருந்தாலும் என பதிலளிக்கவும்."
      );
    });

    it("pins the guidance line verbatim", () => {
      expect(TAMIL_ANSWER_GUIDANCE).toBe("ஆம், இல்லை அல்லது இருந்தாலும் என பதிலளிக்கவும்.");
    });

    it("contains no forbidden openers or pitch content", () => {
      for (const forbidden of ["வணக்கம்", "சரி", "முதல் கேள்வி", "Business Card", "Paper", "Elevator", "Pitch", "USP", "How can I help"]) {
        expect(TAMIL_QUALIFICATION_CALL_OPENING).not.toContain(forbidden);
      }
      expect(TAMIL_QUALIFICATION_CALL_OPENING).not.toBe(TAMIL_QUALIFICATION_INTRO);
    });
  });

  describe("classifyClosedTamilResponse — the SERVER-side closed-answer gate", () => {
    it("ஆம் → YES, இல்லை → NO, இருந்தாலும் → MAYBE", () => {
      expect(classifyClosedTamilResponse("ஆம்")).toBe("YES");
      expect(classifyClosedTamilResponse("இல்லை")).toBe("NO");
      expect(classifyClosedTamilResponse("இருந்தாலும்")).toBe("MAYBE");
    });

    it("normalizes obvious ASR variation: punctuation, repetition, spelling drift", () => {
      expect(classifyClosedTamilResponse("ஆம்.")).toBe("YES");
      expect(classifyClosedTamilResponse("ஆமாம்")).toBe("YES");
      expect(classifyClosedTamilResponse("ஆம் ஆம்")).toBe("YES");
      expect(classifyClosedTamilResponse(" இல்ல ")).toBe("NO");
      expect(classifyClosedTamilResponse("இருந்தாலும்.")).toBe("MAYBE");
    });

    it("rejects every disallowed example from the spec — no arbitrary natural language", () => {
      for (const invalid of [
        "எங்களுக்கு ஒரு பிரச்சினை இருக்கிறது",
        "ஆம், இருக்கிறது",
        "எனக்கு தெரியவில்லை",
        "சரி",
        "maybe",
        "yes we have a problem",
      ]) {
        expect(classifyClosedTamilResponse(invalid)).toBeNull();
      }
    });

    it("rejects empty/whitespace and mixed-class utterances — never invents a classification", () => {
      expect(classifyClosedTamilResponse("")).toBeNull();
      expect(classifyClosedTamilResponse("   ")).toBeNull();
      expect(classifyClosedTamilResponse("ஆம் இல்லை")).toBeNull();
    });
  });

  describe("getTamilQualificationDirective", () => {
    const directive = getTamilQualificationDirective();

    it("embeds every authored question with its real number, and no 13", () => {
      for (const { number, question } of TAMIL_QUALIFICATION_QUESTIONS) {
        expect(directive).toContain(`${number}. ${question}`);
      }
      expect(directive).not.toMatch(/\n13\. /);
      expect(directive).toContain("no question 13");
    });

    it("mandates the closed-ended tool contract: raw Tamil reply, SERVER classification, tool-driven progression", () => {
      expect(directive).toContain("STRICT CLOSED-ENDED questionnaire");
      expect(directive).toContain(TAMIL_ANSWER_GUIDANCE);
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
  });
});

/**
 * The English counterpart to the Tamil questionnaire above — same 16
 * questions/numbers, same server-owned branching, added per the product
 * owner's explicit request. Every test here mirrors its Tamil twin above
 * exactly, proving the two flows are architecturally identical and that
 * building English never touched a single Tamil-named export (all of the
 * Tamil tests above still pass unchanged).
 */
describe("English questionnaire (mirrors the Tamil 2026-08-10 revision)", () => {
  it("pins Set 1 verbatim", () => {
    expect(ENGLISH_QUALIFICATION_SET1).toEqual([
      "Does your business have a specific problem that needs solving?",
      "Has this problem been going on for more than 3 months?",
      "Have you tried any other solution before this?",
      "Can you make this decision on your own?",
      "Is the amount you have in mind within our price range?",
      "Are you planning to start this within this month?",
      "Is this something you need right now?",
    ]);
  });

  it("pins Set 2 verbatim — 9 questions, no Q13", () => {
    expect(ENGLISH_QUALIFICATION_SET2).toEqual([
      "Do you think this solution would be useful for your business?",
      "Is quality and speed more important to you than price?",
      "Is there any reason holding you back from moving forward?",
      "Is that related to price?",
      "Are you ready to decide today?",
      "Did this come through a referral?",
      "Would you like to be connected with customers in your area?",
      "Now, to move this forward, shall I show you our calendar so you can book a time that suits you?",
      "Shall we go ahead with that?",
    ]);
  });

  it("Q13 does not exist anywhere", () => {
    expect(getAuthoredEnglishQuestion(13)).toBeNull();
    expect(ENGLISH_QUALIFICATION_QUESTIONS.some((q) => q.number === 13)).toBe(false);
    expect(ALL_ENGLISH_QUESTIONS).toHaveLength(16);
  });

  it("every derived structure comes from the one master list, and mirrors the Tamil list's numbering exactly", () => {
    expect(ENGLISH_QUALIFICATION_SET1).toEqual(ENGLISH_QUALIFICATION_QUESTIONS.filter((q) => q.number <= 7).map((q) => q.question));
    expect(ENGLISH_QUALIFICATION_SET2).toEqual(ENGLISH_QUALIFICATION_QUESTIONS.filter((q) => q.number >= 8).map((q) => q.question));
    expect(ALL_ENGLISH_QUESTIONS).toEqual(ENGLISH_QUALIFICATION_QUESTIONS.map((q) => q.question));
    expect(new Set(ALL_ENGLISH_QUESTIONS).size).toBe(16);
    expect(ENGLISH_QUALIFICATION_QUESTIONS.map((q) => q.number)).toEqual(TAMIL_QUALIFICATION_QUESTIONS.map((q) => q.number));
  });

  describe("call opening (what plays after Start AI Conversation)", () => {
    it("STARTS with Question 1 exactly, followed only by the closed-answer guidance", () => {
      expect(ENGLISH_QUALIFICATION_CALL_OPENING.startsWith(ENGLISH_QUALIFICATION_SET1[0])).toBe(true);
      expect(ENGLISH_QUALIFICATION_CALL_OPENING).toBe(withAnswerGuidance(ENGLISH_QUALIFICATION_SET1[0], ENGLISH_ANSWER_GUIDANCE));
      expect(ENGLISH_QUALIFICATION_CALL_OPENING).toBe(
        "Does your business have a specific problem that needs solving?\n\nPlease answer with Yes, No, or Maybe."
      );
    });

    it("pins the guidance line verbatim", () => {
      expect(ENGLISH_ANSWER_GUIDANCE).toBe("Please answer with Yes, No, or Maybe.");
    });

    it("contains no forbidden openers or pitch content", () => {
      for (const forbidden of ["Hello", "Welcome", "founder", "Business Card", "Paper", "Elevator", "Pitch", "USP", "How can I help"]) {
        expect(ENGLISH_QUALIFICATION_CALL_OPENING).not.toContain(forbidden);
      }
    });
  });

  describe("classifyClosedEnglishResponse — the SERVER-side closed-answer gate", () => {
    it("yes → YES, no → NO, maybe → MAYBE (case-insensitive)", () => {
      expect(classifyClosedEnglishResponse("yes")).toBe("YES");
      expect(classifyClosedEnglishResponse("Yes")).toBe("YES");
      expect(classifyClosedEnglishResponse("no")).toBe("NO");
      expect(classifyClosedEnglishResponse("No")).toBe("NO");
      expect(classifyClosedEnglishResponse("maybe")).toBe("MAYBE");
      expect(classifyClosedEnglishResponse("Maybe")).toBe("MAYBE");
    });

    it("normalizes obvious ASR/spelling variation: punctuation, repetition, common variants", () => {
      expect(classifyClosedEnglishResponse("yes.")).toBe("YES");
      expect(classifyClosedEnglishResponse("yeah")).toBe("YES");
      expect(classifyClosedEnglishResponse("yep")).toBe("YES");
      expect(classifyClosedEnglishResponse("yes yes")).toBe("YES");
      expect(classifyClosedEnglishResponse(" nope ")).toBe("NO");
      expect(classifyClosedEnglishResponse("nah")).toBe("NO");
      expect(classifyClosedEnglishResponse("maybe.")).toBe("MAYBE");
    });

    it("rejects arbitrary sentences that merely contain a permitted word — no arbitrary natural language", () => {
      for (const invalid of [
        "we have a problem",
        "yes we have a problem",
        "yes, we do",
        "I don't know",
        "sure",
        "ஆம்", // wrong language for an English session
        "maybe later",
      ]) {
        expect(classifyClosedEnglishResponse(invalid)).toBeNull();
      }
    });

    it("rejects empty/whitespace and mixed-class utterances — never invents a classification", () => {
      expect(classifyClosedEnglishResponse("")).toBeNull();
      expect(classifyClosedEnglishResponse("   ")).toBeNull();
      expect(classifyClosedEnglishResponse("yes no")).toBeNull();
    });
  });

  describe("matchAuthoredEnglishQuestion", () => {
    it("maps drifted transcripts back to the exact authored wording for all 16 questions, case-insensitively", () => {
      for (const q of ALL_ENGLISH_QUESTIONS) {
        expect(matchAuthoredEnglishQuestion(`  ${q.replace("?", "").toUpperCase()} `)).toBe(q);
      }
    });

    it("still matches when the closed-answer guidance is spoken after the question", () => {
      for (const q of ALL_ENGLISH_QUESTIONS) {
        expect(matchAuthoredEnglishQuestion(`${q}\n\nPlease answer with Yes, No, or Maybe.`)).toBe(q);
      }
    });

    it("returns null for non-question chatter, the bare guidance, and empty input", () => {
      expect(matchAuthoredEnglishQuestion("Thanks, that's a great answer.")).toBeNull();
      expect(matchAuthoredEnglishQuestion("Please answer with Yes, No, or Maybe.")).toBeNull();
      expect(matchAuthoredEnglishQuestion("")).toBeNull();
    });
  });

  describe("getEnglishQualificationDirective", () => {
    const directive = getEnglishQualificationDirective();

    it("embeds every authored question with its real number, and no 13", () => {
      for (const { number, question } of ENGLISH_QUALIFICATION_QUESTIONS) {
        expect(directive).toContain(`${number}. ${question}`);
      }
      expect(directive).not.toMatch(/\n13\. /);
      expect(directive).toContain("no question 13");
    });

    it("mandates the closed-ended tool contract: raw reply, SERVER classification, tool-driven progression", () => {
      expect(directive).toContain("STRICT CLOSED-ENDED questionnaire");
      expect(directive).toContain(ENGLISH_ANSWER_GUIDANCE);
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

    it("never mentions Tamil script — this is the English-language directive", () => {
      expect(directive).not.toMatch(/[஀-௿]/); // Tamil Unicode block
    });
  });

  describe("isQualificationSupportedLanguage", () => {
    it("accepts exactly ta and en", () => {
      expect(isQualificationSupportedLanguage("ta")).toBe(true);
      expect(isQualificationSupportedLanguage("en")).toBe(true);
    });

    it("rejects every other language and unset/unknown values — the general conversation stays untouched there", () => {
      for (const lang of ["hi", "te", "ml", "kn", "", undefined, "fr"]) {
        expect(isQualificationSupportedLanguage(lang)).toBe(false);
      }
    });
  });
});
