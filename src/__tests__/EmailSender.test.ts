import { ResendEmailAdapter } from "@/core/infrastructure/email/ResendEmailAdapter";

/**
 * The Settings page has always had an "Email Sender Name" field. Until now it
 * was written to email_settings.sender_name and read by nothing — every message
 * went out as "AI Voice Business Card", so the setting appeared to work and
 * changed nothing a recipient could see.
 */
const REAL_KEY = "re_9f2Kx7Qw4tLmVb8ZaHc3NpRs";

function captureRequest() {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return { ok: true, json: async () => ({ id: "msg_1" }) } as Response;
  }) as typeof fetch;
  return calls;
}

describe("ResendEmailAdapter From header", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("sends under the company's configured sender name", async () => {
    const calls = captureRequest();
    await new ResendEmailAdapter(REAL_KEY).sendEmail({
      to: "visitor@example.com",
      subject: "Your meeting is confirmed",
      html: "<p>Hi</p>",
      fromName: "Pagalava Data Analytics",
    });

    expect(calls[0].body.from).toBe("Pagalava Data Analytics <notifications@voicecard.ai>");
  });

  it("falls back to the platform name when no company has configured one", async () => {
    const calls = captureRequest();
    await new ResendEmailAdapter(REAL_KEY).sendEmail({ to: "v@example.com", subject: "s", html: "<p>h</p>" });

    expect(calls[0].body.from).toBe("AI Voice Business Card <notifications@voicecard.ai>");
  });

  it("treats a blank configured name as unset rather than sending an empty From", async () => {
    const calls = captureRequest();
    await new ResendEmailAdapter(REAL_KEY).sendEmail({ to: "v@example.com", subject: "s", html: "<p>h</p>", fromName: "   " });

    expect(calls[0].body.from).toBe("AI Voice Business Card <notifications@voicecard.ai>");
  });

  it("strips characters that would let a tenant inject extra recipients or headers", async () => {
    const calls = captureRequest();
    await new ResendEmailAdapter(REAL_KEY).sendEmail({
      to: "v@example.com",
      subject: "s",
      html: "<p>h</p>",
      // A company name is tenant-controlled input; unescaped it could close the
      // display name and append an address of the tenant's choosing.
      fromName: 'Acme" <attacker@evil.test>, victim',
    });

    const from = String(calls[0].body.from);
    expect(from).toBe("Acme attacker evil.test victim <notifications@voicecard.ai>");
    expect(from).not.toContain("attacker@evil.test");
  });

  it("does not call the API at all when the key is a placeholder", async () => {
    const calls = captureRequest();
    const result = await new ResendEmailAdapter("your-resend-api-key").sendEmail({ to: "v@example.com", subject: "s", html: "<p>h</p>" });

    expect(calls).toHaveLength(0);
    expect(result.success).toBe(true);
  });
});
