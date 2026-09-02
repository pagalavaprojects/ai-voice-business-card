import {
  resolveRequestLanguage,
  resolveGreeting,
  getLanguageDirective,
  resolveSuggestedQuestions,
  resolveTranscriberConfig,
  resolveCompanyLanguageSettings,
  clampToEnabledLanguages,
  resolveEnabledLanguageList,
} from "@/features/language/server";
import { Company, Employee } from "@/core/domain/models/types";
import { MAYLAANAI_INTRODUCTION, MAYLAANAI_INTRODUCTION_TA } from "@/features/language/greetings";
import { DEMO_COMPANY_ID } from "@/shared/lib/demoCard";

const company = { name: "Acme Corp", website: "https://acme.example" } as Company;
const employee = { name: "Jane Doe", designation: "Founder" } as Employee;

describe("resolveRequestLanguage", () => {
  it("accepts a supported code", () => {
    expect(resolveRequestLanguage("en")).toBe("en");
    expect(resolveRequestLanguage("hi")).toBe("hi");
  });

  it("falls back to Tamil for null, unsupported, or malformed input", () => {
    expect(resolveRequestLanguage(null)).toBe("ta");
    expect(resolveRequestLanguage("fr")).toBe("ta");
    expect(resolveRequestLanguage("<script>")).toBe("ta");
  });
});

describe("resolveGreeting", () => {
  it("prefers an explicit per-language override when one exists", () => {
    const agent = { greetings: { en: "Custom hello, {{company_name}}!" }, first_message: null, welcome_message_language: null };
    expect(resolveGreeting(agent, company, employee, "en")).toBe("Custom hello, Acme Corp!");
  });

  it("falls back to the legacy first_message when it's tagged as the requested language", () => {
    const agent = { greetings: {}, first_message: "The original {{employee_name}} pitch.", welcome_message_language: "en" };
    expect(resolveGreeting(agent, company, employee, "en")).toBe("The original Jane Doe pitch.");
  });

  it("does NOT use first_message for a language it isn't tagged as", () => {
    // This is the case that keeps a Tamil-authored first_message from
    // leaking into a visitor who picks English — it must fall through to
    // the generic platform template instead.
    const agent = { greetings: {}, first_message: "வணக்கம்.", welcome_message_language: "ta" };
    const result = resolveGreeting(agent, company, employee, "en");
    expect(result).not.toBe("வணக்கம்.");
    expect(result).toMatch(/Hello/);
  });

  it("falls back to the platform's generic per-language template when there is no agent data at all", () => {
    expect(resolveGreeting(null, company, employee, "hi")).toContain("नमस्कार");
    expect(resolveGreeting(null, company, employee, "ta")).toContain("வணக்கம்");
    expect(resolveGreeting(null, company, employee, "en")).toMatch(/Hello/);
  });

  it("substitutes company/employee template variables in every branch", () => {
    const withOverride = resolveGreeting({ greetings: { en: "Hi from {{company_name}}" } }, company, employee, "en");
    expect(withOverride).toBe("Hi from Acme Corp");

    const withDefault = resolveGreeting(null, company, employee, "en");
    expect(withDefault).toContain("Acme Corp");
    expect(withDefault).toContain("Jane Doe");
  });
});

describe("MaylaanAI's FINAL APPROVED English introduction (per-company authored override)", () => {
  const maylaanCompany = { ...company, id: DEMO_COMPANY_ID, name: "Pagalava Data Analytics" } as Company;
  const agentWithDbGreeting = {
    greetings: { en: "Hello.\n\nOn behalf of Pagalava Data Analytics Private Limited, we warmly welcome you to our services." },
    first_message: null,
    welcome_message_language: null,
  };

  // The approved content is duplicated VERBATIM so any edit to the
  // authoritative constant — a paraphrase, a trimmed sentence, a
  // "grammar fix" — fails this suite loudly.
  const APPROVED_INTRODUCTION = `Hello.

On behalf of Pagalava Data Analytics Private Limited, we would like to introduce our services to you.

Pagalava Data Analytics is a Women-led Deep Tech Startup company.

We provide the artificial intelligence solutions needed by mid-sized businesses through the Technology as a Service (TaaS) model.

TaaS is a model where companies use the technology facilities they need (Software, Hardware, AI Models, Data Analytics, etc.) on a rental/subscription basis, instead of purchasing them outright.

How TaaS works: Machine Learning models that analyze data with artificial intelligence to support decision-making, along with Big Data that is collected, stored, and analyzed, are delivered through Cloud Platforms.

As a result, companies can use modern technology without needing large investments.

The benefits of TaaS for the Micro, Small, and Medium Enterprises (MSME) sector are as follows:

1. Lower Investment – No need for heavy upfront capital.
2. Scalability – Services can be scaled up or down as the business grows.
3. AI-Powered Decision Making – Analyzing customer behavior and sales trends to support better business decisions.
4. Inventory & Supply Chain Management – Big Data enables accurate inventory management and demand forecasting.
5. Competitiveness – Small businesses gain access to the same advanced technology as large corporations, at a much lower cost.

In summary, TaaS greatly supports MSMEs' growth and competitiveness through accessible, service-based technology.`;

  it("returns the approved introduction EXACTLY for MaylaanAI's English visitors", () => {
    expect(resolveGreeting(null, maylaanCompany, employee, "en")).toBe(APPROVED_INTRODUCTION);
    expect(MAYLAANAI_INTRODUCTION).toBe(APPROVED_INTRODUCTION);
  });

  it("wins over even a DB-authored English greeting — the code is the single source of truth for this company", () => {
    expect(resolveGreeting(agentWithDbGreeting, maylaanCompany, employee, "en")).toBe(APPROVED_INTRODUCTION);
  });

  it("the OLD introduction is no longer active for MaylaanAI English", () => {
    const result = resolveGreeting(agentWithDbGreeting, maylaanCompany, employee, "en");
    expect(result).not.toContain("we warmly welcome you to our services");
    expect(result).not.toContain("Smart AI Business Card");
    expect(result).not.toContain("How can I help you today?");
    expect(result).not.toContain("VoiceCard AI");
  });

  // The approved TAMIL introduction (supplied 2026-09-01) is now the parallel
  // per-company override for Tamil visitors — a separate code-authored
  // constant, NOT a translation of the English one. Duplicated verbatim so any
  // edit to the authoritative constant fails this suite loudly.
  const APPROVED_INTRODUCTION_TA = `வணக்கம்.

Pagalava Data Analytics Private Limited சார்பாக எங்களுடைய சேவைகளை உங்களுக்கு தற்பொழுது அறிமுகப்படுத்துகிறோம்.

Pagalava Data Analytics என்பது ஒரு Women-led Deep Tech Startup நிறுவனம்.

நடுத்தர நிறுவனங்களுக்கு தேவையான செயற்கை நுண்ணறிவு தீர்வுகளை Technology as a Service (TaaS) முறையில் வழங்குகிறோம்.

TaaS என்பது நிறுவனங்கள் தங்களுக்கு தேவையான தொழில்நுட்ப வசதிகளை (Software, Hardware, AI Models, Data Analytics போன்றவை) சொந்தமாக வாங்காமல், சேவையாக வாடகை முறையில் பயன்படுத்தும் மாதிரி ஆகும்.

TaaS எப்படி வேலை செய்கிறது: செயற்கை நுண்ணறிவு தரவுகளை பகுப்பாய்வு செய்து, முடிவெடுக்க உதவும் Machine Learning மாடல்களை மற்றும் Big Data தரவுகளை சேகரித்து, சேமித்து, பகுப்பாய்வு செய்து, Cloud Platform மூலம் வழங்கப்படுகின்றன

இதனால் நிறுவனங்கள் பெரிய முதலீடு இல்லாமலேயே, நவீன தொழில்நுட்பத்தை பயன்படுத்த முடியும்.

சிறு, குறு, நடுத்தர தொழில்கள், துறைக்கு TaaS ன் பயன் பாடுகள் பின்வருமாறு: ஒன்று, குறைந்த முதலீடு, இரண்டாவது, scalability, மூன்றாவது, AI-Powered முடிவெடுத்தல் - வாடிக்கையாளர் நடத்தை, விற்பனை போக்கு போன்றவற்றை பகுப்பாய்வு செய்து சிறந்த வணிக முடிவுகள் எடுக்க உதவுகிறது. நான்காவது, Inventory & Supply Chain Management – Big Data மூலம் இருப்பு நிர்வாகம், தேவை கணிப்பு (Demand Forecasting) துல்லியமாகிறது. ஐன்தாவது, போட்டித்திறன் – பெரிய நிறுவனங்களுக்கு இணையான தொழில்நுட்ப வசதிகளை, குறைந்த செலவில் சிறு தொழில்கள் பெற முடிகிறது.

சுருக்கமாக, TaaS என்பது MSMEகளுக்கு சேவைகள் மூலம் அவற்றின் வளர்ச்சிக்கும் போட்டித்திறனுக்கும் பெரிதும் உதவுகிறது.`;

  it("returns the approved TAMIL introduction EXACTLY for MaylaanAI's Tamil visitors, and it wins over a DB greeting", () => {
    expect(resolveGreeting(null, maylaanCompany, employee, "ta")).toBe(APPROVED_INTRODUCTION_TA);
    expect(resolveGreeting(agentWithDbGreeting, maylaanCompany, employee, "ta")).toBe(APPROVED_INTRODUCTION_TA);
    expect(MAYLAANAI_INTRODUCTION_TA).toBe(APPROVED_INTRODUCTION_TA);
  });

  it("keeps the English and Tamil approved introductions as distinct content — the Tamil one is not the English one, and vice versa", () => {
    expect(APPROVED_INTRODUCTION_TA).not.toBe(APPROVED_INTRODUCTION);
    expect(resolveGreeting(null, maylaanCompany, employee, "ta")).not.toBe(APPROVED_INTRODUCTION);
    expect(resolveGreeting(null, maylaanCompany, employee, "en")).not.toBe(APPROVED_INTRODUCTION_TA);
  });

  it("neither approved introduction leaks to other companies (English OR Tamil)", () => {
    const otherId = { ...company, id: "99999999-9999-9999-9999-999999999999" } as Company;
    const otherEn = resolveGreeting(null, otherId, employee, "en");
    expect(otherEn).not.toBe(APPROVED_INTRODUCTION);
    expect(otherEn).toMatch(/Hello/);
    const otherTa = resolveGreeting(null, otherId, employee, "ta");
    expect(otherTa).not.toBe(APPROVED_INTRODUCTION_TA);
    expect(otherTa).toMatch(/வணக்கம்/); // the generic default Tamil greeting, not the approved intro
  });

  it("the other display languages (hi/te/ml/kn) are NOT given the approved Tamil intro — it is Tamil-only", () => {
    for (const lang of ["hi", "te", "ml", "kn"] as const) {
      expect(resolveGreeting(null, maylaanCompany, employee, lang)).not.toBe(APPROVED_INTRODUCTION_TA);
    }
  });
});

describe("getLanguageDirective", () => {
  it("names the language by both English and native name for every supported language", () => {
    expect(getLanguageDirective("ta")).toContain("Tamil");
    expect(getLanguageDirective("ta")).toContain("தமிழ்");
    expect(getLanguageDirective("hi")).toContain("Hindi");
    expect(getLanguageDirective("hi")).toContain("हिन्दी");
  });

  it("instructs the model not to mix languages unless asked", () => {
    expect(getLanguageDirective("en")).toMatch(/not mix|do not switch/i);
  });
});

describe("resolveSuggestedQuestions", () => {
  it("uses real FAQ questions for English when FAQs exist", () => {
    const faqs = ["How much does this cost?", "Do you offer a free trial?"];
    expect(resolveSuggestedQuestions("en", faqs)).toEqual(faqs);
  });

  it("falls back to the curated locale list for English when there are no FAQs", () => {
    const result = resolveSuggestedQuestions("en", []);
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toEqual([]);
  });

  it("always uses the curated locale list for Tamil/Hindi, ignoring English FAQ text", () => {
    const faqs = ["How much does this cost?"];
    const ta = resolveSuggestedQuestions("ta", faqs);
    const hi = resolveSuggestedQuestions("hi", faqs);
    expect(ta).not.toEqual(faqs);
    expect(hi).not.toEqual(faqs);
    expect(ta[0]).toMatch(/[஀-௿]/); // contains Tamil script
    expect(hi[0]).toMatch(/[ऀ-ॿ]/); // contains Devanagari script
  });
});

describe("resolveTranscriberConfig", () => {
  it("resolves Deepgram for the two languages nova-2 actually supports (en/hi)", () => {
    expect(resolveTranscriberConfig("en")).toEqual({ provider: "deepgram", language: "en" });
    expect(resolveTranscriberConfig("hi")).toEqual({ provider: "deepgram", language: "hi" });
  });

  it("resolves the OpenAI transcriber (with model) for Tamil/Kannada — Deepgram nova-2 rejects both with a Vapi validation 400", () => {
    expect(resolveTranscriberConfig("ta")).toEqual({ provider: "openai", model: "gpt-4o-mini-transcribe", language: "ta" });
    expect(resolveTranscriberConfig("kn")).toEqual({ provider: "openai", model: "gpt-4o-mini-transcribe", language: "kn" });
  });

  it("resolves Azure with the Indian locale for Telugu/Malayalam — validated against the live Vapi account, no env gate needed anymore", () => {
    expect(resolveTranscriberConfig("te")).toEqual({ provider: "azure", language: "te-IN" });
    expect(resolveTranscriberConfig("ml")).toEqual({ provider: "azure", language: "ml-IN" });
  });
});

describe("resolveCompanyLanguageSettings", () => {
  it("returns no override for null/undefined/empty settings", () => {
    expect(resolveCompanyLanguageSettings(null)).toEqual({ defaultLanguage: null, enabledLanguages: [] });
    expect(resolveCompanyLanguageSettings(undefined)).toEqual({ defaultLanguage: null, enabledLanguages: [] });
    expect(resolveCompanyLanguageSettings({})).toEqual({ defaultLanguage: null, enabledLanguages: [] });
  });

  it("reads a valid default_language and enabled_languages", () => {
    expect(resolveCompanyLanguageSettings({ default_language: "hi", enabled_languages: ["en", "hi", "ta"] })).toEqual({
      defaultLanguage: "hi",
      enabledLanguages: ["en", "hi", "ta"],
    });
  });

  it("discards a malformed default_language rather than throwing", () => {
    expect(resolveCompanyLanguageSettings({ default_language: "fr" }).defaultLanguage).toBeNull();
    expect(resolveCompanyLanguageSettings({ default_language: 42 }).defaultLanguage).toBeNull();
  });

  it("filters out unsupported entries from enabled_languages instead of failing the whole list", () => {
    expect(resolveCompanyLanguageSettings({ enabled_languages: ["en", "fr", "ta", 42, null] }).enabledLanguages).toEqual(["en", "ta"]);
  });

  it("treats a non-array enabled_languages as unset", () => {
    expect(resolveCompanyLanguageSettings({ enabled_languages: "en" }).enabledLanguages).toEqual([]);
  });
});

describe("clampToEnabledLanguages", () => {
  it("passes the language through unchanged when no restriction is configured", () => {
    expect(clampToEnabledLanguages("te", { defaultLanguage: null, enabledLanguages: [] })).toBe("te");
  });

  it("passes the language through unchanged when it is in the enabled set", () => {
    expect(clampToEnabledLanguages("hi", { defaultLanguage: null, enabledLanguages: ["en", "hi"] })).toBe("hi");
  });

  it("falls back to the company default when the requested language is disabled and the default is enabled", () => {
    expect(clampToEnabledLanguages("te", { defaultLanguage: "en", enabledLanguages: ["en", "hi"] })).toBe("en");
  });

  it("falls back to the first enabled language when there is no usable company default", () => {
    expect(clampToEnabledLanguages("te", { defaultLanguage: null, enabledLanguages: ["hi", "en"] })).toBe("hi");
    // the configured default itself isn't in the enabled set — same fallback
    expect(clampToEnabledLanguages("te", { defaultLanguage: "kn", enabledLanguages: ["hi", "en"] })).toBe("hi");
  });
});

describe("resolveEnabledLanguageList", () => {
  it("returns every platform language when unrestricted", () => {
    const result = resolveEnabledLanguageList({ defaultLanguage: null, enabledLanguages: [] });
    expect(result).toEqual(["ta", "en", "hi", "te", "ml", "kn"]);
  });

  it("returns exactly the company's enabled subset when restricted", () => {
    const result = resolveEnabledLanguageList({ defaultLanguage: null, enabledLanguages: ["en", "ta"] });
    expect(result).toEqual(["en", "ta"]);
  });
});
