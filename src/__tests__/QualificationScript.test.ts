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
  ALL_TAMIL_QUESTIONS,
  getAuthoredQuestion,
  getTamilQualificationDirective,
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
    it("is EXACTLY the new Question 1 — no greeting, no preamble, no filler", () => {
      expect(TAMIL_QUALIFICATION_CALL_OPENING).toBe(TAMIL_QUALIFICATION_SET1[0]);
      expect(TAMIL_QUALIFICATION_CALL_OPENING).toBe("உங்கள் வணிகத்தில் தீர்வு காண வேண்டிய குறிப்பிட்ட பிரச்சினை உள்ளதா?");
    });

    it("contains no forbidden openers or pitch content", () => {
      for (const forbidden of ["வணக்கம்", "சரி", "முதல் கேள்வி", "Business Card", "Paper", "Elevator", "Pitch", "USP", "How can I help"]) {
        expect(TAMIL_QUALIFICATION_CALL_OPENING).not.toContain(forbidden);
      }
      expect(TAMIL_QUALIFICATION_CALL_OPENING).not.toBe(TAMIL_QUALIFICATION_INTRO);
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

    it("mandates the tool contract: English translation, strict YES/NO/MAYBE, tool-driven progression", () => {
      expect(directive).toContain("ENGLISH sentence");
      expect(directive).toContain("YES, NO, or MAYBE");
      expect(directive).toContain("Declined to answer");
      expect(directive).toContain("get_next_qualification_question");
      expect(directive).toContain("SPEAK IT EXACTLY as returned");
      expect(directive).toContain("never skip a question it returned");
    });

    it("bans preamble/pitch replay and mandates re-asking on unclear speech", () => {
      expect(directive).toContain("opening line IS question 1");
      expect(directive).toContain("Never replay the founder pitch");
      expect(directive).toContain("ask the SAME");
      expect(directive).toContain("do NOT call the tool");
    });
  });
});
