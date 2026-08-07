import { resolveRequestLanguage, resolveGreeting, getLanguageDirective, resolveSuggestedQuestions } from "@/features/language/server";
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
