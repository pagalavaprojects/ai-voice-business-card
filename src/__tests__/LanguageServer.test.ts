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
    expect(result).toEqual(["en", "ta", "hi", "te", "ml", "kn"]);
  });

  it("returns exactly the company's enabled subset when restricted", () => {
    const result = resolveEnabledLanguageList({ defaultLanguage: null, enabledLanguages: ["en", "ta"] });
    expect(result).toEqual(["en", "ta"]);
  });
});
