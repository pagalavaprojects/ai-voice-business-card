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

  // These two previously asserted that the raw error message was returned to
  // the caller. That was the defect: a Postgres failure reached the browser
  // verbatim as `invalid input syntax for type integer: "19.488"`, disclosing
  // column types and query shape. The detail now goes to the logs under a
  // correlation id and only the id is returned.
  it("does not leak internal error detail to the client on a 500", async () => {
    const response = handleApiError(new Error("Supabase connection reset: password authentication failed for user 'postgres'"));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(JSON.stringify(json)).not.toContain("password authentication failed");
    expect(JSON.stringify(json)).not.toContain("Supabase connection reset");
    expect(json.message).toBe("Something went wrong on our end. Please try again.");
  });

  it("returns a correlation id so a reported failure can be found in the logs", async () => {
    const response = handleApiError(new Error("boom"));
    const json = await response.json();

    const reference = (json.errors as string[]).find((e) => e.startsWith("Reference: "));
    expect(reference).toBeDefined();
    expect(reference).toMatch(/^Reference: [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("gives each failure a distinct id", async () => {
    const idOf = async (r: Response) => ((await r.json()).errors as string[])[0];
    expect(await idOf(handleApiError(new Error("a")))).not.toBe(await idOf(handleApiError(new Error("b"))));
  });

  it("handles a non-Error thrown value without crashing", async () => {
    const response = handleApiError("a plain string was thrown");
    expect(response.status).toBe(500);
  });
});
