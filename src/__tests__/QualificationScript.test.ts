/**
 * The founder-authored Tamil qualification content is source-of-truth:
 * these tests pin the exact wording (any future "improvement" fails
 * loudly) and pin the directive's routing rules — Set 2 for HOT/WARM only,
 * COLD skips straight to booking and must still be able to book.
 */
import {
  TAMIL_QUALIFICATION_INTRO,
  TAMIL_QUALIFICATION_CALL_OPENING,
  TAMIL_QUALIFICATION_SET1,
  TAMIL_QUALIFICATION_SET2,
  getTamilQualificationDirective,
} from "@/features/voice/lib/qualificationScript";

describe("authored Tamil qualification content", () => {
  it("keeps the intro verbatim — exact opening, exact closing, key supplied phrases", () => {
    expect(TAMIL_QUALIFICATION_INTRO.startsWith("வணக்கம், இந்த மாதம் எத்தனை பேர் உங்கள் Business Card ஐ கொடுத்திருப்பீங்க")).toBe(true);
    expect(TAMIL_QUALIFICATION_INTRO.endsWith("இது தான் இந்த card ன் சிறப்பு. நன்றி.")).toBe(true);
    expect(TAMIL_QUALIFICATION_INTRO).toContain("அது உங்கள் தப்பு இல்லை — அந்த Paper Business Card ன் தவறு.");
    expect(TAMIL_QUALIFICATION_INTRO).toContain("தீர்வு எங்களின் Maylaan AI");
    expect(TAMIL_QUALIFICATION_INTRO).toContain("Appointment Boom ஆகிடும்");
    expect(TAMIL_QUALIFICATION_INTRO).toContain("so no-show குறையும்");
  });

  it("keeps all 7 Set-1 questions verbatim and in order", () => {
    expect(TAMIL_QUALIFICATION_SET1).toHaveLength(7);
    expect(TAMIL_QUALIFICATION_SET1[0]).toBe("உங்கள் வணிகத்தில் முதன்மையாகத் தீர்வு காண விரும்பும் பிரச்சினை என்ன?");
    expect(TAMIL_QUALIFICATION_SET1[3]).toBe("இந்த முடிவை தாங்கள் மட்டும் எடுப்பீர்களா, அல்லது வேறு யாரேனும் இதில் இணைந்திருப்பார்களா?");
    expect(TAMIL_QUALIFICATION_SET1[6]).toBe("இது தங்களுக்கு எவ்வளவு முக்கியத்துவம் வாய்ந்தது — இப்போதே தேவையா, அல்லது யோசிக்கலாமா?");
  });

  it("keeps all 10 Set-2 questions verbatim and in order", () => {
    expect(TAMIL_QUALIFICATION_SET2).toHaveLength(10);
    expect(TAMIL_QUALIFICATION_SET2[0]).toBe("இந்தத் தீர்வு உங்களுக்குக் கிடைத்தால், உங்கள் வணிகத்தில் என்ன மாற்றத்தை எதிர்பார்க்கிறீர்கள்?");
    expect(TAMIL_QUALIFICATION_SET2[6]).toBe("இதைக் குறித்து தங்களுக்கு யார் தெரிவித்தார்கள்?");
    expect(TAMIL_QUALIFICATION_SET2[9]).toBe("இவ்வாறு தொடரலாமா?");
  });

  describe("qualification call opening (what actually plays after Book an Appointment)", () => {
    it("is short, states the purpose, and asks Question 1 verbatim as part of the opening", () => {
      expect(TAMIL_QUALIFICATION_CALL_OPENING.length).toBeLessThan(400);
      expect(TAMIL_QUALIFICATION_CALL_OPENING).toContain("சில சிறிய கேள்விகள்");
      expect(TAMIL_QUALIFICATION_CALL_OPENING.endsWith(TAMIL_QUALIFICATION_SET1[0])).toBe(true);
    });

    it("is NOT the founder pitch — none of the pitch's signature phrases appear", () => {
      expect(TAMIL_QUALIFICATION_CALL_OPENING).not.toContain("Business Card ஐ கொடுத்திருப்பீங்க");
      expect(TAMIL_QUALIFICATION_CALL_OPENING).not.toContain("Paper Business Card");
      expect(TAMIL_QUALIFICATION_CALL_OPENING).not.toContain("Elevator Pitch");
      expect(TAMIL_QUALIFICATION_CALL_OPENING).not.toContain("no-show");
      expect(TAMIL_QUALIFICATION_CALL_OPENING).not.toBe(TAMIL_QUALIFICATION_INTRO);
    });
  });

  it("has no duplicated questions across the 17", () => {
    const all = [...TAMIL_QUALIFICATION_SET1, ...TAMIL_QUALIFICATION_SET2];
    expect(new Set(all).size).toBe(17);
  });

  describe("getTamilQualificationDirective", () => {
    const directive = getTamilQualificationDirective();

    it("embeds every question verbatim, numbered 1-17 in order", () => {
      for (const q of [...TAMIL_QUALIFICATION_SET1, ...TAMIL_QUALIFICATION_SET2]) {
        expect(directive).toContain(q);
      }
      expect(directive.indexOf("1. உங்கள் வணிகத்தில்")).toBeLessThan(directive.indexOf("8. இந்தத் தீர்வு"));
      expect(directive).toContain("17. இவ்வாறு தொடரலாமா?");
    });

    it("routes HOT/WARM into Set 2 and COLD past it — with COLD still explicitly able to book", () => {
      expect(directive).toContain("If it is HOT or WARM, continue with Set 2");
      expect(directive).toContain("If it is COLD, SKIP Set 2");
      expect(directive).toContain("a COLD lead must always still be able to book");
    });

    it("forbids inventing answers and mandates the existing tool persistence", () => {
      expect(directive).toContain("save_lead / update_lead_qualification");
      expect(directive).toContain("Never invent an answer the visitor did not give");
      expect(directive).toContain("never");
      expect(directive).toContain("do not translate, paraphrase, shorten, reword or renumber");
    });

    it("handles the opening-already-asked-Q1 case, refusals, and bans pitch replay", () => {
      expect(directive).toContain("do NOT repeat it");
      expect(directive).toContain("continue with question 2");
      expect(directive).toContain("Never replay the founder");
      expect(directive).toContain("declines a question");
    });
  });
});
