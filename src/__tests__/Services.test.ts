import { CreateServiceSchema, UpdateServiceSchema } from "@/core/domain/models/types";
import { validateValues, payloadFromValues, valuesFromService } from "@/features/dashboard/components/services/ServiceForm";

const COMPANY = "33333333-3333-3333-3333-333333333333";

const validService = {
  company_id: COMPANY,
  name: "Workflow Automation",
  description: "We automate one production workflow end to end.",
  price: 1500,
};

describe("CreateServiceSchema", () => {
  it("applies defaults so a minimal payload is complete", () => {
    const parsed = CreateServiceSchema.parse(validService);
    expect(parsed.currency).toBe("USD");
    expect(parsed.is_active).toBe(true);
    expect(parsed.is_featured).toBe(false);
    expect(parsed.display_order).toBe(0);
    expect(parsed.deliverables).toEqual([]);
    expect(parsed.timeline).toBe("");
  });

  it("accepts a free-text duration range", () => {
    // Duration reuses the pre-existing `timeline` column and stays free text:
    // real engagements are quoted as ranges, which a numeric field cannot
    // express without implying precision that isn't there.
    for (const timeline of ["2-6 weeks", "one afternoon", "3 months, phased"]) {
      expect(CreateServiceSchema.safeParse({ ...validService, timeline }).success).toBe(true);
    }
  });

  it("rejects a slug that would break card URLs", () => {
    for (const slug of ["My Service!", "UPPER", "trailing-", "has space"]) {
      expect(CreateServiceSchema.safeParse({ ...validService, slug }).success).toBe(false);
    }
    expect(CreateServiceSchema.safeParse({ ...validService, slug: "workflow-automation" }).success).toBe(true);
  });

  it("rejects a negative price", () => {
    expect(CreateServiceSchema.safeParse({ ...validService, price: -1 }).success).toBe(false);
  });

  it("rejects a CTA link that isn't a URL", () => {
    expect(CreateServiceSchema.safeParse({ ...validService, cta_url: "not-a-url" }).success).toBe(false);
    expect(CreateServiceSchema.safeParse({ ...validService, cta_url: "https://example.com/book" }).success).toBe(true);
  });

  it("UpdateServiceSchema is partial and cannot change tenancy", () => {
    expect(UpdateServiceSchema.safeParse({ name: "Renamed" }).success).toBe(true);
    expect("company_id" in UpdateServiceSchema.shape).toBe(false);
  });
});

describe("ServiceForm value mapping", () => {
  const base = { ...valuesFromService(null), name: "Workflow Automation", description: "A real description", price: "1500" };

  it("splits deliverables one-per-line, dropping blanks", () => {
    const payload = payloadFromValues({ ...base, deliverables: "Assessment\n\n  Build  \nHandover\n" });
    expect(payload.deliverables).toEqual(["Assessment", "Build", "Handover"]);
  });

  it("converts empty optional strings to null rather than storing empties", () => {
    const payload = payloadFromValues(base);
    expect(payload.slug).toBeNull();
    expect(payload.cta_url).toBeNull();
    expect(payload.category).toBeNull();
  });

  it("reports a missing price as a field error instead of submitting NaN", () => {
    expect(validateValues({ ...base, price: "" }).price).toMatch(/required/i);
  });

  it("surfaces the same errors the API would return", () => {
    const errors = validateValues({ ...base, name: "X", cta_url: "nope" });
    expect(errors.name).toBeDefined();
    expect(errors.cta_url).toBeDefined();
  });

  it("accepts a fully valid form", () => {
    expect(validateValues(base)).toEqual({});
  });

  it("round-trips an existing service through the form without data loss", () => {
    const existing = {
      id: "s1",
      company_id: COMPANY,
      name: "Workflow Automation",
      description: "Full description",
      short_description: "Short one",
      deliverables: ["Assessment", "Build"],
      timeline: "2-6 weeks",
      price: 1500,
      currency: "EUR",
      slug: "workflow-automation",
      category: "Consulting",
      image_path: "path/img.png",
      cta_label: "Book",
      cta_url: "https://example.com",
      display_order: 3,
      is_featured: true,
      is_active: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const payload = payloadFromValues(valuesFromService(existing));
    expect(payload.deliverables).toEqual(["Assessment", "Build"]);
    expect(payload.timeline).toBe("2-6 weeks");
    expect(payload.currency).toBe("EUR");
    expect(payload.display_order).toBe(3);
    expect(payload.is_featured).toBe(true);
    expect(payload.is_active).toBe(false);
  });
});
