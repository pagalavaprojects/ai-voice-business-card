/**
 * The email adapter must never claim success for an email that was never
 * sent. Discovered in production reconciliation: a placeholder
 * RESEND_API_KEY simulated sends with `success: true` and sim_msg_* ids,
 * which flowed into email_logs as SENT and into the booking notification
 * audit as "client:email": "sent" — for emails that did not exist — while
 * /api/health simultaneously (and correctly) reported email unconfigured.
 * Production now fails closed (failWhenUnconfigured defaults to
 * NODE_ENV === "production", injectable because the toolchain
 * compile-inlines NODE_ENV); the dev/test simulation is preserved.
 */
import { ResendEmailAdapter } from "@/core/infrastructure/email/ResendEmailAdapter";
import { NotificationService } from "@/core/application/services/NotificationService";

const OPTIONS = { to: "visitor@example.com", subject: "Test", html: "<p>x</p>" };
const PLACEHOLDER_KEY = "your-resend-api-key";

describe("ResendEmailAdapter — unconfigured provider honesty", () => {
  it("production mode (failWhenUnconfigured) with a placeholder key throws — never a simulated success", async () => {
    const adapter = new ResendEmailAdapter(PLACEHOLDER_KEY, true);
    await expect(adapter.sendEmail(OPTIONS)).rejects.toThrow(/not configured/i);
  });

  it("dev/test mode keeps the harmless simulation (success with a sim_msg id)", async () => {
    const adapter = new ResendEmailAdapter(PLACEHOLDER_KEY, false);
    const result = await adapter.sendEmail(OPTIONS);
    expect(result.success).toBe(true);
    expect(result.id).toMatch(/^sim_msg_/);
  });

  it("the full NotificationService chain records FAILED (not SENT) when unconfigured in production mode", async () => {
    const updates: Array<{ status: string; meta?: Record<string, unknown> }> = [];
    const emailLogRepo = {
      createLog: jest.fn().mockResolvedValue({ id: "log-1" }),
      updateLog: jest.fn(async (_id: string, status: string, meta?: Record<string, unknown>) => {
        updates.push({ status, meta });
        return {};
      }),
    } as never;
    const service = new NotificationService(new ResendEmailAdapter(PLACEHOLDER_KEY, true), emailLogRepo);

    const result = await service.send({ companyId: "c1", to: OPTIONS.to, subject: "S", html: "<p/>", templateName: "t" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not configured/i);
    expect(updates.map((u) => u.status)).toEqual(["FAILED"]);
    // No fabricated provider id anywhere in the failure record.
    expect(JSON.stringify(updates)).not.toContain("sim_msg_");
  });
});
