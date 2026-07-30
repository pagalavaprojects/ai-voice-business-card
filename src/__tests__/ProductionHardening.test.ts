import { CalcomAdapter } from "@/core/infrastructure/booking/calcom/CalcomAdapter";
import { ResendEmailAdapter } from "@/core/infrastructure/email/ResendEmailAdapter";
import { hasPermission } from "@/shared/lib/rbac";
import { checkRateLimit } from "@/shared/lib/rateLimit";

describe("Production Hardening Integrations", () => {
  it("should allow OWNER all permissions and restrict VIEWER from writing leads", () => {
    expect(hasPermission("OWNER", "manage:settings")).toBe(true);
    expect(hasPermission("VIEWER", "write:leads")).toBe(false);
  });

  it("should handle CalcomAdapter booking creation with fallback or API response", async () => {
    const adapter = new CalcomAdapter();
    const result = await adapter.createBooking({
      eventTypeId: 12345,
      start: new Date().toISOString(),
      end: new Date().toISOString(),
      responses: { name: "Test Visitor", email: "visitor@example.com" },
      timeZone: "America/New_York",
    });

    expect(result.status).toBe("ACCEPTED");
    expect(result.meetingUrl).toBeDefined();
  });

  it("should handle ResendEmailAdapter email sending", async () => {
    const emailAdapter = new ResendEmailAdapter();
    const result = await emailAdapter.sendEmail({
      to: "visitor@example.com",
      subject: "Meeting Confirmation",
      html: "<p>Thank you for booking!</p>",
    });

    expect(result.success).toBe(true);
    expect(result.id).toBeDefined();
  });

  it("should enforce rate limiting after exceeding max requests", () => {
    const ip = "192.168.1.1";
    for (let i = 0; i < 5; i++) {
      checkRateLimit(ip, 5, 60000);
    }
    const result = checkRateLimit(ip, 5, 60000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});
