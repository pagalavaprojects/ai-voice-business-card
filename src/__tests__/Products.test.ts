import { CreateProductSchema, UpdateProductSchema } from "@/core/domain/models/types";
import { slugify } from "@/shared/lib/slugify";
import { toCsv } from "@/shared/lib/csv";
import { validateValues, payloadFromValues, valuesFromProduct } from "@/features/dashboard/components/products/ProductForm";

const COMPANY = "33333333-3333-3333-3333-333333333333";

const validProduct = {
  company_id: COMPANY,
  name: "AI Starter Plan",
  description: "A starter subscription for small teams.",
  pricing: 49,
};

describe("CreateProductSchema", () => {
  it("applies defaults so a minimal payload is complete", () => {
    const parsed = CreateProductSchema.parse(validProduct);
    expect(parsed.currency).toBe("USD");
    expect(parsed.is_active).toBe(true);
    expect(parsed.is_featured).toBe(false);
    expect(parsed.discount_percent).toBe(0);
    expect(parsed.features).toEqual([]);
    expect(parsed.gallery_paths).toEqual([]);
  });

  it("rejects a slug that would break card URLs", () => {
    for (const slug of ["My Product!", "UPPER", "trailing-", "-leading", "has space"]) {
      expect(CreateProductSchema.safeParse({ ...validProduct, slug }).success).toBe(false);
    }
    expect(CreateProductSchema.safeParse({ ...validProduct, slug: "ai-starter-plan-2" }).success).toBe(true);
  });

  it("bounds discount to a real percentage", () => {
    expect(CreateProductSchema.safeParse({ ...validProduct, discount_percent: -5 }).success).toBe(false);
    expect(CreateProductSchema.safeParse({ ...validProduct, discount_percent: 101 }).success).toBe(false);
    expect(CreateProductSchema.safeParse({ ...validProduct, discount_percent: 100 }).success).toBe(true);
  });

  it("rejects a negative price", () => {
    expect(CreateProductSchema.safeParse({ ...validProduct, pricing: -1 }).success).toBe(false);
  });

  it("rejects a CTA link that isn't a URL", () => {
    expect(CreateProductSchema.safeParse({ ...validProduct, cta_url: "not-a-url" }).success).toBe(false);
    expect(CreateProductSchema.safeParse({ ...validProduct, cta_url: "https://example.com/buy" }).success).toBe(true);
  });

  it("UpdateProductSchema is partial and cannot change tenancy", () => {
    expect(UpdateProductSchema.safeParse({ name: "Renamed" }).success).toBe(true);
    expect("company_id" in UpdateProductSchema.shape).toBe(false);
  });
});

describe("slugify", () => {
  it("produces slugs the schema accepts", () => {
    for (const input of ["AI Starter Plan", "  Spaced  Out  ", "Café Découverte", "Product #1 — 50% Off!"]) {
      const slug = slugify(input);
      // The generator and the validator must agree, or the UI's own
      // auto-filled slug gets rejected by its own API.
      expect(CreateProductSchema.safeParse({ ...validProduct, slug }).success).toBe(true);
    }
  });

  it("transliterates diacritics rather than dropping the letters", () => {
    expect(slugify("Café Découverte")).toBe("cafe-decouverte");
  });

  it("never leaves a trailing hyphen, even when truncating", () => {
    expect(slugify("a".repeat(200) + " b")).not.toMatch(/-$/);
  });
});

describe("CSV export", () => {
  it("quotes fields containing commas so columns don't shift", () => {
    // A product literally named `27" Monitor, Black` would otherwise push
    // every following column one cell right in Excel.
    const csv = toCsv(["Name", "Price"], [['27" Monitor, Black', 299]]);
    expect(csv).toBe('Name,Price\r\n"27"" Monitor, Black",299');
  });

  it("escapes newlines inside a field", () => {
    expect(toCsv(["A"], [["line1\nline2"]])).toBe('A\r\n"line1\nline2"');
  });

  it("renders null and undefined as empty cells, not the string 'null'", () => {
    expect(toCsv(["A", "B"], [[null, undefined]])).toBe("A,B\r\n,");
  });
});

describe("ProductForm value mapping", () => {
  it("splits one-per-line textareas into arrays, dropping blank lines", () => {
    const values = { ...valuesFromProduct(null), name: "X", description: "Some description", pricing: "10", features: "Fast\n\n  Reliable  \n" };
    expect(payloadFromValues(values).features).toEqual(["Fast", "Reliable"]);
  });

  it("converts empty optional strings to null rather than storing empties", () => {
    const payload = payloadFromValues({ ...valuesFromProduct(null), name: "X", description: "Some description", pricing: "10" });
    expect(payload.sku).toBeNull();
    expect(payload.cta_url).toBeNull();
    expect(payload.slug).toBeNull();
  });

  it("reports a missing price as a field error instead of submitting NaN", () => {
    const errors = validateValues({ ...valuesFromProduct(null), name: "X", description: "Some description", pricing: "" });
    expect(errors.pricing).toMatch(/required/i);
  });

  it("surfaces the same errors the API would return", () => {
    const errors = validateValues({ ...valuesFromProduct(null), name: "X", description: "short", pricing: "10", cta_url: "nope" });
    expect(errors.name).toBeDefined(); // min length 2
    expect(errors.cta_url).toBeDefined();
  });

  it("accepts a fully valid form", () => {
    expect(
      validateValues({ ...valuesFromProduct(null), name: "AI Starter", description: "A real description", pricing: "49" })
    ).toEqual({});
  });
});
