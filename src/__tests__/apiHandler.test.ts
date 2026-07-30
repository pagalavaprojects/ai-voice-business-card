import { z } from "zod";
import { handleApiError } from "@/shared/lib/apiHandler";
import { AuthError } from "@/shared/lib/tenant";

describe("handleApiError", () => {
  it("converts AuthError to its own status and message", async () => {
    const response = handleApiError(new AuthError(403, "You do not have access to this company"));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.success).toBe(false);
    expect(json.message).toBe("You do not have access to this company");
  });

  it("converts a 401 AuthError correctly (distinct from 403)", async () => {
    const response = handleApiError(new AuthError(401, "Authentication required"));
    expect(response.status).toBe(401);
  });

  it("converts ZodError to 422 with one message per field issue", async () => {
    const schema = z.object({ email: z.string().email(), age: z.number().min(18) });
    const result = schema.safeParse({ email: "not-an-email", age: 5 });
    expect(result.success).toBe(false);

    const response = handleApiError(result.error);
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.message).toBe("Validation failed");
    expect(json.errors).toEqual(expect.arrayContaining([expect.stringContaining("email"), expect.stringContaining("age")]));
  });

  it("converts an unexpected Error to 500 without swallowing its message", async () => {
    const response = handleApiError(new Error("Supabase connection reset"));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.errors).toContain("Supabase connection reset");
  });

  it("converts a non-Error thrown value to a generic 500", async () => {
    const response = handleApiError("a plain string was thrown");
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.errors).toContain("Internal server error");
  });
});
