import { CreateEmployeeSchema, UpdateEmployeeSchema, Employee } from "@/core/domain/models/types";
import { validateValues, payloadFromValues, valuesFromEmployee } from "@/features/dashboard/components/employees/EmployeeForm";
import { resolveCallVoiceId } from "@/shared/lib/voice";
import { isEmployeeCardVisible } from "@/shared/lib/employeeVisibility";
import { hasPermission } from "@/shared/lib/rbac";

const COMPANY = "44444444-4444-4444-4444-444444444444";

const validEmployee = {
  company_id: COMPANY,
  name: "Srinivasan Kandasamy",
  designation: "Founder",
  email: "srini@example.com",
  phone: "+91 98765 43210",
};

describe("CreateEmployeeSchema", () => {
  it("applies defaults so a minimal payload is complete", () => {
    const parsed = CreateEmployeeSchema.parse(validEmployee);
    expect(parsed.is_active).toBe(true);
    expect(parsed.display_order).toBe(0);
  });

  it("requires both contact channels", () => {
    // A card with no way to reach a human is the failure this module exists to
    // prevent, so neither field is optional.
    expect(CreateEmployeeSchema.safeParse({ ...validEmployee, email: undefined }).success).toBe(false);
    expect(CreateEmployeeSchema.safeParse({ ...validEmployee, phone: undefined }).success).toBe(false);
    expect(CreateEmployeeSchema.safeParse({ ...validEmployee, email: "not-an-email" }).success).toBe(false);
  });

  it("rejects a relative social link, which would resolve against our own origin", () => {
    expect(CreateEmployeeSchema.safeParse({ ...validEmployee, social_links: { LinkedIn: "/in/srini" } }).success).toBe(false);
    expect(
      CreateEmployeeSchema.safeParse({ ...validEmployee, social_links: { LinkedIn: "https://linkedin.com/in/srini" } }).success
    ).toBe(true);
  });

  it("only accepts voices the runtime can actually speak", () => {
    expect(CreateEmployeeSchema.safeParse({ ...validEmployee, voice_id: "nova" }).success).toBe(true);
    // "vapi-default" is a real legacy value in the agents table and is NOT a
    // voice; accepting it here would produce a silently broken call.
    expect(CreateEmployeeSchema.safeParse({ ...validEmployee, voice_id: "vapi-default" }).success).toBe(false);
    // Null is the documented "inherit" state and must stay valid.
    expect(CreateEmployeeSchema.safeParse({ ...validEmployee, voice_id: null }).success).toBe(true);
  });

  it("UpdateEmployeeSchema is partial and cannot change tenancy or account linkage", () => {
    expect(UpdateEmployeeSchema.safeParse({ name: "Renamed" }).success).toBe(true);
    expect("company_id" in UpdateEmployeeSchema.shape).toBe(false);
    // Linking an employee row to a login belongs to the Members module —
    // allowing it here would let an employee edit grant someone else access.
    expect("user_id" in UpdateEmployeeSchema.shape).toBe(false);
  });

  describe("public URL slug", () => {
    it("accepts a lowercase hyphenated slug and rejects anything that would break /c/{slug}", () => {
      expect(CreateEmployeeSchema.safeParse({ ...validEmployee, slug: "srinivasan" }).success).toBe(true);
      expect(CreateEmployeeSchema.safeParse({ ...validEmployee, slug: "sri-k" }).success).toBe(true);
      for (const bad of ["Srinivasan", "sri k", "sri_k", "-leading", "trailing-", "sri!"]) {
        expect(CreateEmployeeSchema.safeParse({ ...validEmployee, slug: bad }).success).toBe(false);
      }
    });

    it("null keeps the card reachable only at its long-form URL, and stays valid", () => {
      expect(CreateEmployeeSchema.safeParse({ ...validEmployee, slug: null }).success).toBe(true);
    });
  });
});

describe("employee voice resolution", () => {
  it("prefers the employee's voice over the agent's", () => {
    expect(resolveCallVoiceId("shimmer", "onyx")).toBe("shimmer");
  });

  it("inherits the agent's voice when the employee has none", () => {
    expect(resolveCallVoiceId(null, "onyx")).toBe("onyx");
    expect(resolveCallVoiceId("   ", "onyx")).toBe("onyx");
  });

  it("falls back to the platform default when neither is usable", () => {
    // The legacy agents value: neither level yields a real voice.
    expect(resolveCallVoiceId(null, "vapi-default")).toBe("nova");
    expect(resolveCallVoiceId(undefined, undefined)).toBe("nova");
  });

  it("uses the company Settings default before the platform default", () => {
    // The Settings page has always had this field; until now nothing read it.
    expect(resolveCallVoiceId(null, null, "echo")).toBe("echo");
    // And a legacy agent label must not shadow it — treating "vapi-default" as
    // "set" would pin every call to nova and silently ignore the company's
    // configured voice.
    expect(resolveCallVoiceId(null, "vapi-default", "echo")).toBe("echo");
  });

  it("keeps the more specific level in charge when several are set", () => {
    expect(resolveCallVoiceId("shimmer", "onyx", "echo")).toBe("shimmer");
    expect(resolveCallVoiceId(null, "onyx", "echo")).toBe("onyx");
  });
});

describe("employee permission tiers", () => {
  // Mirrors the catalog split deliberately: a manager curates the roster, only
  // OWNER/ADMIN can remove someone from it.
  it.each(["OWNER", "ADMIN"] as const)("%s can read, write and delete employees", (role) => {
    expect(hasPermission(role, "read:employees")).toBe(true);
    expect(hasPermission(role, "write:employees")).toBe(true);
    expect(hasPermission(role, "delete:employees")).toBe(true);
  });

  it("MANAGER can edit the roster but not remove anyone from it", () => {
    expect(hasPermission("MANAGER", "write:employees")).toBe(true);
    expect(hasPermission("MANAGER", "delete:employees")).toBe(false);
  });

  it.each(["EMPLOYEE", "VIEWER"] as const)("%s can only read the roster", (role) => {
    expect(hasPermission(role, "read:employees")).toBe(true);
    expect(hasPermission(role, "write:employees")).toBe(false);
    expect(hasPermission(role, "delete:employees")).toBe(false);
  });
});

describe("public card visibility during the deploy-before-migrate window", () => {
  it("keeps serving a card when is_active does not exist yet", () => {
    // Migration 20260807 is not applied: PostgREST omits the column entirely.
    // A truthiness check here would 404 every business card in production.
    expect(isEmployeeCardVisible({})).toBe(true);
    expect(isEmployeeCardVisible({ is_active: undefined })).toBe(true);
    // A legacy row could also carry NULL before the NOT NULL default settles.
    expect(isEmployeeCardVisible({ is_active: null })).toBe(true);
  });

  it("takes the card offline only on an explicit deactivation", () => {
    expect(isEmployeeCardVisible({ is_active: false })).toBe(false);
    expect(isEmployeeCardVisible({ is_active: true })).toBe(true);
  });
});

describe("EmployeeForm value mapping", () => {
  const base = {
    ...valuesFromEmployee(null),
    name: "Srinivasan Kandasamy",
    designation: "Founder",
    email: "srini@example.com",
    phone: "+91 98765 43210",
  };

  it("parses label|url social links one per line, dropping blanks", () => {
    const payload = payloadFromValues({
      ...base,
      social_links: "LinkedIn|https://linkedin.com/in/srini\n\n  X | https://x.com/srini  \n",
    });
    expect(payload.social_links).toEqual({
      LinkedIn: "https://linkedin.com/in/srini",
      X: "https://x.com/srini",
    });
  });

  it("keeps a separator-less line so Zod reports it instead of silently dropping the row", () => {
    const errors = validateValues({ ...base, social_links: "LinkedIn" });
    expect(errors.social_links).toBeDefined();
  });

  it("converts empty optional strings to null rather than storing empties", () => {
    const payload = payloadFromValues(base);
    expect(payload.office_address).toBeNull();
    expect(payload.timezone).toBeNull();
    expect(payload.prompt_override).toBeNull();
    expect(payload.social_links).toBeNull();
  });

  it("sends a blank voice as null so it keeps inheriting, not as an empty string", () => {
    expect(payloadFromValues({ ...base, voice_id: "" }).voice_id).toBeNull();
    expect(validateValues({ ...base, voice_id: "" })).toEqual({});
  });

  it("lowercases the slug so typing a capitalised name doesn't fail validation", () => {
    const payload = payloadFromValues({ ...base, slug: "Srinivasan" });
    expect(payload.slug).toBe("srinivasan");
    expect(validateValues({ ...base, slug: "Srinivasan" })).toEqual({});
  });

  it("sends a blank slug as null, keeping the card reachable only at its long URL", () => {
    expect(payloadFromValues({ ...base, slug: "" }).slug).toBeNull();
    expect(validateValues({ ...base, slug: "" })).toEqual({});
  });

  it("surfaces the same errors the API would return", () => {
    const errors = validateValues({ ...base, name: "X", email: "nope" });
    expect(errors.name).toBeDefined();
    expect(errors.email).toBeDefined();
  });

  it("accepts a fully valid form", () => {
    expect(validateValues(base)).toEqual({});
  });

  it("round-trips an existing employee through the form without data loss", () => {
    const existing: Employee = {
      id: "e1",
      company_id: COMPANY,
      name: "Srinivasan Kandasamy",
      designation: "Founder",
      email: "srini@example.com",
      phone: "+91 98765 43210",
      office_address: "Coimbatore, India",
      working_hours: "9 AM – 6 PM IST",
      timezone: "Asia/Kolkata",
      social_links: { LinkedIn: "https://linkedin.com/in/srini" },
      avatar_path: "company/avatar.png",
      voice_id: "shimmer",
      prompt_override: "Mention that I cover APAC.",
      display_order: 3,
      is_active: false,
      slug: "srinivasan",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    const payload = payloadFromValues(valuesFromEmployee(existing));
    expect(payload.social_links).toEqual({ LinkedIn: "https://linkedin.com/in/srini" });
    expect(payload.avatar_path).toBe("company/avatar.png");
    expect(payload.voice_id).toBe("shimmer");
    expect(payload.timezone).toBe("Asia/Kolkata");
    expect(payload.prompt_override).toBe("Mention that I cover APAC.");
    expect(payload.display_order).toBe(3);
    expect(payload.is_active).toBe(false);
    expect(payload.slug).toBe("srinivasan");
  });
});
