/**
 * The WhatsApp notifier must be genuinely inert without real credentials —
 * a booking can never fail, slow down, or retry because messaging isn't
 * configured — and must send the Meta-sanctioned payload shape when it is
 * configured (template when one is named, plain text otherwise).
 */
import { MetaCloudWhatsAppNotifier } from "@/core/infrastructure/notifications/WhatsAppNotifier";

function fetchMock(status = 200, body = "{}"): jest.MockedFunction<typeof fetch> {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as Response) as jest.MockedFunction<typeof fetch>;
}

describe("MetaCloudWhatsAppNotifier", () => {
  it.each([
    ["missing", undefined, undefined],
    ["empty", "", ""],
    ["placeholder token", "your-whatsapp-access-token", "123456"],
    ["placeholder phone id", "EAAG-real-looking-token", "your-phone-number-id"],
  ])("is unconfigured and refuses to send when credentials are %s", async (_label, token, phoneId) => {
    const f = fetchMock();
    const notifier = new MetaCloudWhatsAppNotifier(token, phoneId, undefined, f);

    expect(notifier.isConfigured()).toBe(false);
    const result = await notifier.send("+91 94431 25639", "hello");
    expect(result).toEqual({ sent: false, reason: "unconfigured" });
    expect(f).not.toHaveBeenCalled();
  });

  it("rejects an implausible recipient number without calling Meta", async () => {
    const f = fetchMock();
    const notifier = new MetaCloudWhatsAppNotifier("EAAG-token", "1234567890", undefined, f);

    expect(await notifier.send("123", "hello")).toEqual({ sent: false, reason: "invalid_recipient" });
    expect(f).not.toHaveBeenCalled();
  });

  it("sends plain text to the digits-only number when no template is configured", async () => {
    const f = fetchMock();
    const notifier = new MetaCloudWhatsAppNotifier("EAAG-token", "1234567890", undefined, f);

    const result = await notifier.send("+91 94431 25639", "Your meeting is confirmed.");

    expect(result).toEqual({ sent: true });
    expect(f).toHaveBeenCalledWith(
      "https://graph.facebook.com/v20.0/1234567890/messages",
      expect.objectContaining({ method: "POST" })
    );
    const payload = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
    expect(payload).toEqual({
      messaging_product: "whatsapp",
      to: "919443125639",
      type: "text",
      text: { body: "Your meeting is confirmed." },
    });
  });

  it("sends an approved template with the message as its single body parameter when one is named", async () => {
    const f = fetchMock();
    const notifier = new MetaCloudWhatsAppNotifier("EAAG-token", "1234567890", "booking_confirmation", f);

    await notifier.send("+91 94431 25639", "Meeting at 3 PM");

    const payload = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
    expect(payload.type).toBe("template");
    expect(payload.template.name).toBe("booking_confirmation");
    expect(payload.template.components[0].parameters[0].text).toBe("Meeting at 3 PM");
  });

  it("reports an HTTP failure as {sent:false} instead of throwing — a notification never fails its booking", async () => {
    const f = fetchMock(401, '{"error":"bad token"}');
    const notifier = new MetaCloudWhatsAppNotifier("EAAG-token", "1234567890", undefined, f);

    expect(await notifier.send("+91 94431 25639", "hi")).toEqual({ sent: false, reason: "http_401" });
  });

  it("reports a network error as {sent:false} instead of throwing", async () => {
    const f = jest.fn().mockRejectedValue(new Error("ECONNRESET")) as jest.MockedFunction<typeof fetch>;
    const notifier = new MetaCloudWhatsAppNotifier("EAAG-token", "1234567890", undefined, f);

    expect(await notifier.send("+91 94431 25639", "hi")).toEqual({ sent: false, reason: "network_error" });
  });
});
