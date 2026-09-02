/**
 * The three pre-recorded pitches are SPEAK-ONLY by design: a fixed script
 * composed deterministically from the company's own data, rendered to
 * audio server-side. These tests pin the two properties that matter most:
 * the script always reflects real data (never empty, never a template
 * artifact), and each type stays in its duration band (elevator ≈30s,
 * product ≈40s, USP ≈5s at typical TTS pace) in every supported language.
 */
import { composePitchScript, isPitchType, PITCH_TYPES, PitchSourceData, MAYLAANAI_PITCHES, SMART_AI_LEAD_BUSINESS_CARD_TA, SMART_AI_LEAD_BUSINESS_CARD_EN, SMART_AI_LEAD_BUSINESS_CARD_TYPE, getSmartAiLeadBusinessCardScript } from "@/features/voice/lib/pitchScripts";
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
    // The Smart AI Lead Business Card is a fixed script served like intro, NOT
    // a composed PitchType — the composed-pitch guard must keep rejecting it.
    expect(isPitchType(SMART_AI_LEAD_BUSINESS_CARD_TYPE)).toBe(false);
    expect(isPitchType("smart_ai_lead_business_card")).toBe(false);
    expect(isPitchType("")).toBe(false);
    expect(isPitchType(null)).toBe(false);
    expect(isPitchType(undefined)).toBe(false);
  });
});

describe("Smart AI Lead Business Card — approved English + Tamil recorded scripts (2026-09-01)", () => {
  // Duplicated VERBATIM so any edit to the authoritative constant — a
  // paraphrase, a trimmed sentence, a "spelling fix", a collapsed double
  // space — fails this test loudly. This is approved content.
  const APPROVED_EN = `Smart AI Lead Business Card.

This is our AI-powered Business Card.

You can use this Business Card anytime you need it.

When you tap this AI Business Card or share it via QR Code with your existing or new customers and leads, your contact details are instantly saved to their phone's contact list.

It then introduces and explains your business to them.

After that, it instantly answers any questions they ask.

If needed, it also helps them connect with you directly through WhatsApp, Email, or by booking an appointment.

Through the "Book an Appointment" feature, a Lead Assessment is done based on six key data points.

Your Dashboard lets you track how many times a customer or lead has interacted with the AI to learn about your product or service.

If a customer or lead's contact details remain unused for two days, an automatic reminder is sent to them via Email or WhatsApp.

All the data collected is shared with you through Email, WhatsApp, or your Dashboard.`;

  const APPROVED = `Smart AI Lead Business Card.

இது செயற்கை நுண்ணறிவு மூலம் இயங்கும் எங்களுடைய  Business Card ஆகும்.

இந்த Business Card-ஐ தங்களுக்கு தேவையான எந்த நேரத்திலும் பயன்படுத்திக்கொள்ளலாம்.

இந்த AI Business Card-ஐ உங்கள் பழைய மற்றும்  புதிய வாடிக்கையாளர் அல்லது Leads-களின் மொபைலில் tap அல்லது QR Code share செய்தவுடன், உங்கள் தொடர்பு விவரங்கள் உடனடியாக அவர்களின் Contact List-இல் சேமிக்கப்படும்.

அதன்பிறகு, உங்கள் நிறுவனத்தை அவர்களுக்கு விளக்கி கூறும்.

பிறகு, அவர்கள் கேட்கும் கேள்விகளுக்கு உடனடியாக பதிலளிக்கும்.

தேவையானால் உங்கள் WhatsApp, Email அல்லது Book an Appointment வழியாக உங்களை நேரடியாக தொடர்பு கொள்ளவும் உதவும்.

Book an Appointment வழியாக, ஆறு தரவுகள் மூலம் Lead Assessment செய்யப்படும்.

வாடிக்கையாளர் அல்லது Lead எத்தனை முறை உங்களது சேவை அல்லது தயாரிப்பு பற்றி AI உடன் தெரிந்து கொண்டுள்ளார்கள் என்பதை உங்களுடைய Dash Board மூலம் தெரிந்து கொள்ளமுடியும்.

வாடிக்கையாளர் அல்லது Lead பெறப்பட்ட Contact Details தனை இரண்டு நாட்களாக பயன் படுத்தவில்லை எனில், அவர்களுக்கு ஒரு நினைவூட்டல் email அல்லது WhatsApp அனுப்பப்படும்.

பெறப்பட்ட அணைத்து தரவுகளையும் உங்களுக்கு Email அல்லது Whatsapp அல்லது Dash Board மூலம் தெரிய படுத்தும்.`;

  it("both exported constants match their approved scripts EXACTLY (single source of truth)", () => {
    expect(SMART_AI_LEAD_BUSINESS_CARD_EN).toBe(APPROVED_EN);
    expect(SMART_AI_LEAD_BUSINESS_CARD_TA).toBe(APPROVED);
  });

  it("English and Tamil are genuinely different content — never the same string", () => {
    expect(SMART_AI_LEAD_BUSINESS_CARD_EN).not.toBe(SMART_AI_LEAD_BUSINESS_CARD_TA);
    expect(SMART_AI_LEAD_BUSINESS_CARD_EN).not.toMatch(/[஀-௿]/); // English has no Tamil
    expect(SMART_AI_LEAD_BUSINESS_CARD_TA).toMatch(/[஀-௿]/); // Tamil does
  });

  it("the resolver returns English for en, Tamil for ta, and Tamil for every other language", () => {
    expect(getSmartAiLeadBusinessCardScript("en")).toEqual({ language: "en", script: SMART_AI_LEAD_BUSINESS_CARD_EN });
    expect(getSmartAiLeadBusinessCardScript("ta")).toEqual({ language: "ta", script: SMART_AI_LEAD_BUSINESS_CARD_TA });
    for (const lang of ["hi", "te", "ml", "kn"]) {
      expect(getSmartAiLeadBusinessCardScript(lang)).toEqual({ language: "ta", script: SMART_AI_LEAD_BUSINESS_CARD_TA });
    }
  });

  it("neither script collides with a composed pitch or one of the three approved pitches", () => {
    for (const type of PITCH_TYPES) {
      for (const script of [SMART_AI_LEAD_BUSINESS_CARD_EN, SMART_AI_LEAD_BUSINESS_CARD_TA]) {
        expect(script).not.toBe(MAYLAANAI_PITCHES.ta[type]);
        expect(script).not.toBe(MAYLAANAI_PITCHES.en[type]);
      }
    }
  });

  it("uses a distinct internal type key that is not one of the composed pitch types", () => {
    expect(SMART_AI_LEAD_BUSINESS_CARD_TYPE).toBe("smart_ai_lead_business_card");
    expect(PITCH_TYPES).not.toContain(SMART_AI_LEAD_BUSINESS_CARD_TYPE as unknown as (typeof PITCH_TYPES)[number]);
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
    const APPROVED_EN_ELEVATOR = `Hello! I represent Pagalava Data Analytics — a Women-led Deep Tech Startup.

We provide AI solutions for mid-sized businesses through Technology as a Service (TaaS) — meaning companies can access powerful AI and Big Data technology on the Cloud, on a pay-as-you-use basis, without any heavy upfront investment.

This gives MSMEs lower costs, smarter data-driven decisions, accurate inventory management, and the ability to compete with much larger companies.

In short — we help small businesses think big, by delivering AI as a Service!`;

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
