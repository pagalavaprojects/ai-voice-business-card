/**
 * The three pre-recorded pitches are SPEAK-ONLY by design: a fixed script
 * composed deterministically from the company's own data, rendered to
 * audio server-side. These tests pin the two properties that matter most:
 * the script always reflects real data (never empty, never a template
 * artifact), and each type stays in its duration band (elevator ≈30s,
 * product ≈40s, USP ≈5s at typical TTS pace) in every supported language.
 */
import { composePitchScript, isPitchType, PITCH_TYPES, PitchSourceData, MAYLAANAI_PITCHES } from "@/features/voice/lib/pitchScripts";
import { SUPPORTED_LANGUAGES } from "@/features/language/config";
import { DEMO_COMPANY_ID } from "@/shared/lib/demoCard";

const fullData: PitchSourceData = {
  companyName: "Pagalava Data Analytics",
  employeeName: "Srinivasan Kandasamy",
  designation: "Founder",
  website: "https://pagalava.com",
  serviceNames: ["AI Voice Business Cards", "Lead Qualification", "Data Analytics"],
  services: [
    { name: "AI Voice Business Cards", description: "Replace static cards with a live AI voice employee." },
    { name: "Lead Qualification", description: "Every visitor scored automatically." },
  ],
  products: [
    { name: "VoiceCard AI", description: "An always-on AI twin for your business card. It answers in six languages." },
    { name: "Lead Engine", description: "Scores and routes every conversation." },
  ],
};

const emptyCatalog: PitchSourceData = {
  ...fullData,
  serviceNames: [],
  services: [],
  products: [],
};

describe("isPitchType", () => {
  it("accepts exactly the three pitch types and nothing else", () => {
    expect(isPitchType("elevator")).toBe(true);
    expect(isPitchType("product")).toBe(true);
    expect(isPitchType("usp")).toBe(true);
    expect(isPitchType("intro")).toBe(false);
    expect(isPitchType("")).toBe(false);
    expect(isPitchType(null)).toBe(false);
    expect(isPitchType(undefined)).toBe(false);
  });
});

describe("composePitchScript", () => {
  it.each(SUPPORTED_LANGUAGES.map((l) => l.code))("produces non-empty scripts naming the company for every type in %s", (lang) => {
    for (const type of PITCH_TYPES) {
      const script = composePitchScript(type, lang, fullData);
      expect(script.trim().length).toBeGreaterThan(0);
      expect(script).toContain(fullData.companyName);
      // Template artifacts must never reach a spoken script.
      expect(script).not.toMatch(/\{\{|undefined|null/);
    }
  });

  it("keeps the USP to a single short line (~5s of speech) in every language", () => {
    for (const lang of SUPPORTED_LANGUAGES.map((l) => l.code)) {
      const script = composePitchScript("usp", lang, fullData);
      expect(script.length).toBeLessThan(160);
    }
  });

  it("orders lengths USP < elevator < product in English — the 5s/30s/40s duration bands", () => {
    const usp = composePitchScript("usp", "en", fullData);
    const elevator = composePitchScript("elevator", "en", fullData);
    const product = composePitchScript("product", "en", fullData);
    expect(usp.length).toBeLessThan(elevator.length);
    // The English elevator/product bands, in words (~150 wpm TTS):
    const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
    expect(words(elevator)).toBeGreaterThanOrEqual(50);
    expect(words(elevator)).toBeLessThanOrEqual(110);
    expect(words(product)).toBeGreaterThanOrEqual(60);
    expect(words(product)).toBeLessThanOrEqual(130);
  });

  it("mentions the elevator speaker by name and the products by name", () => {
    expect(composePitchScript("elevator", "en", fullData)).toContain("Srinivasan Kandasamy");
    const product = composePitchScript("product", "en", fullData);
    expect(product).toContain("VoiceCard AI");
    expect(product).toContain("Lead Engine");
  });

  it("only the first sentence of a product description is spoken — a full paragraph would blow the 40s band", () => {
    const product = composePitchScript("product", "en", fullData);
    expect(product).toContain("An always-on AI twin for your business card.");
    expect(product).not.toContain("It answers in six languages");
  });

  it("degrades gracefully for a company with no products or services listed", () => {
    for (const lang of SUPPORTED_LANGUAGES.map((l) => l.code)) {
      for (const type of PITCH_TYPES) {
        const script = composePitchScript(type, lang, emptyCatalog);
        expect(script.trim().length).toBeGreaterThan(0);
        expect(script).toContain(emptyCatalog.companyName);
        expect(script).not.toMatch(/\{\{|undefined|null/);
      }
    }
  });

  it("every language produces a genuinely distinct script per type — no accidental English fallback", () => {
    for (const type of PITCH_TYPES) {
      const scripts = SUPPORTED_LANGUAGES.map((l) => composePitchScript(type, l.code, fullData));
      expect(new Set(scripts).size).toBe(SUPPORTED_LANGUAGES.length);
    }
  });

  it("keeps proper nouns verbatim inside non-English frames (Tamil)", () => {
    const script = composePitchScript("elevator", "ta", fullData);
    expect(script).toContain("Srinivasan Kandasamy");
    expect(script).toContain("Pagalava Data Analytics");
    // And the frame itself is Tamil, not English:
    expect(script).toMatch(/வணக்கம்/);
  });

  describe("MaylaanAI's FINAL APPROVED pitch content (per-company authored override)", () => {
    const maylaanData: PitchSourceData = { ...fullData, companyId: DEMO_COMPANY_ID };

    // The approved content is duplicated here VERBATIM — deliberately, so
    // that any edit to the authoritative constants (a paraphrase, a
    // "grammar fix", a dropped sentence) fails this suite loudly. The
    // supplied wording, punctuation, capitalization, product names and
    // ordering are the spec.
    const APPROVED_EN_ELEVATOR = `MaylaanAI is the deep-tech flagship of Pagalava Data Analytics Private Limited, a proudly women-led Indian startup, built on the belief that Big Data and AI should work as hard as you do.

We understand that every business here is built on relationships, trust, and years of hard-earned experience. MaylaanAI doesn't replace that it strengthens it with data, so your decisions are backed by evidence, not just instinct.

We don't just build technology. We build outcomes you can bank on.

MaylaanAI is a Technology-as-a-Service (TaaS) platform built for Indian businesses, no heavy upfront investment, no hiring a data science team, no complicated IT overhead. Just results, delivered as a service, at a cost that makes sense for growing enterprises.`;

    const APPROVED_EN_PRODUCT = `Our Product Smart Lead Card provides More qualified leads, less time wasted chasing the wrong customer

Our product Customer Experience Analytics Understands what keeps your customers coming back and why some walk away

Our product Predictive Business Intelligence Plans your stock, sales, and strategy ahead of the market, not behind it

Our Marketing Performance Optimization Knows exactly which ad, which channel, which rupee is actually working

Our product Operations & Bottleneck Analysis, Finds where time and money are leaking in your operations and plug it.

Our product Fraud Detection & Risk Management Protects your business and your customers' trust, round the clock`;

    const APPROVED_EN_WHY_US = `Every business you run generates a goldmine of data — every bill, every customer call, every order.

But between managing staff, suppliers, and customers, who has the time to mine it?

That's where we step in like a trusted partner, not an outside vendor.

We don't hand you complicated software and leave you to figure it out. We deliver plug-and-play intelligence watching your customers, predicting your numbers, optimizing your marketing spend, fixing your operational bottlenecks, and catching fraud, 24/7 so you can focus on what you do best: running your business.

You don't buy AI. You subscribe to outcomes measurable, trackable, and worth every rupee.

This is why growing businesses are choosing Pagalava — not merely to adopt technology, but to gain an edge your competitors don't have.

MaylaanAI — by Pagalava Data Analytics Pvt. Ltd. | A Women-Led Deep-Tech Venture, Proudly Rooted in India`;

    const APPROVED_TA_ELEVATOR = `MaylaanAI, பெண்கள் முன்னின்று நடத்தும் இந்திய தொடக்க நிறுவனமான Pagalava Data Analytics Private Limited-இன் தொழில்நுட்ப முன்னோடி படைப்பாகும். நீங்கள் உழைக்கும் அளவுக்கே, பெருந்தரவும் (Big Data) செயற்கை நுண்ணறிவும் (AI) உங்களுக்காக உழைக்க வேண்டும் என்பதே எங்கள் அசைக்க முடியாத நம்பிக்கை.

இங்கு ஒவ்வொரு வணிகமும் உறவுகள், நம்பிக்கை, மற்றும் ஆண்டுக்கணக்கில் ஈட்டிய அனுபவத்தின் மீது கட்டப்பட்டது என்பதை நாங்கள் நன்கு அறிவோம். அதை MaylaanAI மாற்றாது; மாறாக, தரவின் துணையுடன் அதை மேலும் வலுவாக்குகிறது. இதனால் உங்கள் முடிவுகள் வெறும் மனத்துணிவை மட்டுமல்ல, உறுதியான ஆதாரத்தையும் சார்ந்தே இருக்கும்.

நாங்கள் வெறும் தொழில்நுட்பத்தை உருவாக்கவில்லை; நீங்கள் நம்பி சார்ந்திருக்கக்கூடிய முடிவுகளை உருவாக்குகிறோம்.

MaylaanAI, இந்திய வணிகங்களுக்காகவே உருவாக்கப்பட்ட ஒரு சேவை-வழி-தொழில்நுட்ப (TaaS) தளமாகும் — பெரிய முதலீடு தேவையில்லை, தனியாக தரவியல் குழு அமைக்க வேண்டியதில்லை, சிக்கலான தகவல் தொழில்நுட்ப அமைப்பும் தேவையில்லை. வளரும் நிறுவனங்களுக்கு ஏற்ற செலவில், நேரடியான பலன்கள் மட்டுமே சேவையாக வழங்கப்படும்.`;

    const APPROVED_TA_PRODUCT = `எங்களின் ஆறு வெவ்வேறு சேவைகள்:

முதலாவது சேவை, Smart Lead Card: சரியான வாடிக்கையாளர்களை மட்டுமே இலக்கு வைத்து, தவறான வாடிக்கையாளர்களை தேடி நேரத்தை வீணாக்காமல் காக்கிறது.

இரண்டாவது சேவை, Customer Experience Analytics: உங்கள் வாடிக்கையாளர் ஏன் மீண்டும் மீண்டும் திரும்பி வருகிறார், ஏன் சிலர் விலகிச் செல்கிறார் என்பதை புரிந்துகொள்கிறது.

மூன்றாவது சேவை, Predictive Business Intelligence: சந்தையை பின்தொடராமல், முன்கூட்டியே உங்கள் ஸ்டாக், விற்பனை மற்றும் உத்தியை திட்டமிடுகிறது.

நான்காவது சேவை, Marketing Performance Optimization: எந்த விளம்பரம், எந்த வழிமுறை, எந்த ரூபாய் உண்மையில் பலன் தருகிறது என்பதை துல்லியமாக அறிகிறது.

ஐந்தாவது சேவை, Operations & Bottleneck Analysis: உங்கள் செயல்பாடுகளில் நேரமும் பணமும் எங்கு கசிந்து வீணாகிறது என கண்டறிந்து, அதை சரிசெய்கிறது.

ஆறாவது சேவை, Fraud Detection & Risk Management: 24 மணி நேரமும் உங்கள் வணிகத்தையும் வாடிக்கையாளர்களின் நம்பிக்கையையும் பாதுகாக்கிறது.`;

    const APPROVED_TA_WHY_US = `நாங்கள் ஒரு விற்பனையாளர் அல்ல, உங்களின் நம்பகமான நண்பர்.

நுண்ணறிவு மென்பொருளை உடனடியாகப் பயன்படுத்தக்கூடிய வகையில் சேவைகளை வழங்கும் ஆரோக்கியமான ஆலோசகர்.

உங்களின் ஒவ்வொரு ரூபாயிணையும் மதிப்புள்ள சேவைகளாக மாற்றும் வல்லுநர்.

இதனால்தான் வளர்ந்துவரும் வணிகங்கள் Pagalava-வைத் தேர்ந்தெடுக்கின்றன — வெறும் தொழில்நுட்பத்தைப் பெறுவதற்காக அல்ல, போட்டியாளர்களிடம் இல்லாத ஒரு முன்னிலையைப் பெறுவதற்காக.`;

    it("returns the approved ENGLISH content EXACTLY for all three pitches", () => {
      expect(composePitchScript("elevator", "en", maylaanData)).toBe(APPROVED_EN_ELEVATOR);
      expect(composePitchScript("product", "en", maylaanData)).toBe(APPROVED_EN_PRODUCT);
      expect(composePitchScript("usp", "en", maylaanData)).toBe(APPROVED_EN_WHY_US);
    });

    it("returns the approved TAMIL content EXACTLY for all three pitches", () => {
      expect(composePitchScript("elevator", "ta", maylaanData)).toBe(APPROVED_TA_ELEVATOR);
      expect(composePitchScript("product", "ta", maylaanData)).toBe(APPROVED_TA_PRODUCT);
      expect(composePitchScript("usp", "ta", maylaanData)).toBe(APPROVED_TA_WHY_US);
    });

    it("the exported constants themselves match the approved strings (single source of truth)", () => {
      expect(MAYLAANAI_PITCHES.en.elevator).toBe(APPROVED_EN_ELEVATOR);
      expect(MAYLAANAI_PITCHES.en.product).toBe(APPROVED_EN_PRODUCT);
      expect(MAYLAANAI_PITCHES.en.usp).toBe(APPROVED_EN_WHY_US);
      expect(MAYLAANAI_PITCHES.ta.elevator).toBe(APPROVED_TA_ELEVATOR);
      expect(MAYLAANAI_PITCHES.ta.product).toBe(APPROVED_TA_PRODUCT);
      expect(MAYLAANAI_PITCHES.ta.usp).toBe(APPROVED_TA_WHY_US);
    });

    it("preserves the approved product names in their approved order (both languages)", () => {
      const order = [
        "Smart Lead Card",
        "Customer Experience Analytics",
        "Predictive Business Intelligence",
        "Marketing Performance Optimization",
        "Operations & Bottleneck Analysis",
        "Fraud Detection & Risk Management",
      ];
      for (const script of [MAYLAANAI_PITCHES.en.product, MAYLAANAI_PITCHES.ta.product]) {
        const positions = order.map((name) => script.indexOf(name));
        expect(positions.every((p) => p >= 0)).toBe(true);
        expect([...positions].sort((a, b) => a - b)).toEqual(positions);
      }
    });

    it("the OLD pitch content is gone: no legacy Tamil NFC-card script, no composed greeting openers", () => {
      for (const lang of ["en", "ta"] as const) {
        for (const type of PITCH_TYPES) {
          const script = composePitchScript(type, lang, maylaanData);
          expect(script).not.toContain("NFC");
          expect(script).not.toContain("பேப்பர் கார்டு");
          expect(script).not.toMatch(/^Hello, I'm/);
          expect(script).not.toMatch(/^வணக்கம்/);
        }
      }
    });

    it("does NOT leak the authored content to other companies, and other display languages stay composed", () => {
      const otherTenant = { ...fullData, companyId: "99999999-9999-9999-9999-999999999999" };
      expect(composePitchScript("elevator", "en", otherTenant)).not.toBe(APPROVED_EN_ELEVATOR);
      expect(composePitchScript("elevator", "ta", otherTenant)).not.toBe(APPROVED_TA_ELEVATOR);
      expect(composePitchScript("usp", "en", fullData)).not.toBe(APPROVED_EN_WHY_US);
      // MaylaanAI's own Hindi (no approved Hindi copy supplied) keeps the
      // composed script rather than silently borrowing English.
      const hindi = composePitchScript("elevator", "hi", maylaanData);
      expect(hindi).not.toBe(APPROVED_EN_ELEVATOR);
      expect(hindi).toContain(fullData.companyName);
    });
  });
});
