import { NotificationService } from "@/core/application/services/NotificationService";
import { ResendEmailAdapter } from "@/core/infrastructure/email/ResendEmailAdapter";
import { IEmailLogRepository } from "@/core/domain/repositories/IEmailLogRepository";
import { EmailLog } from "@/core/domain/models/types";

function fakeLog(overrides: Partial<EmailLog> = {}): EmailLog {
  return {
    id: "log-1",
    company_id: "company-1",
    to_email: "visitor@example.com",
    subject: "Test",
    template_name: "test",
    status: "QUEUED",
    attempt_count: 0,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("NotificationService", () => {
  let mockEmailLogRepo: jest.Mocked<IEmailLogRepository>;

  beforeEach(() => {
    mockEmailLogRepo = {
      createLog: jest.fn().mockResolvedValue(fakeLog()),
      updateLog: jest.fn().mockImplementation((id, status, data) => Promise.resolve(fakeLog({ id, status, ...data }))),
      listLogs: jest.fn(),
    };
  });

  it("logs SENT with attempt_count 1 on first-try success", async () => {
    const adapter = { sendEmail: jest.fn().mockResolvedValue({ id: "msg-1", success: true }) } as unknown as ResendEmailAdapter;
    const service = new NotificationService(adapter, mockEmailLogRepo);

    const result = await service.send({ companyId: "company-1", to: "visitor@example.com", subject: "Hi", html: "<p>Hi</p>", templateName: "test" });

    expect(result.success).toBe(true);
    expect(adapter.sendEmail).toHaveBeenCalledTimes(1);
    expect(mockEmailLogRepo.updateLog).toHaveBeenCalledWith("log-1", "SENT", expect.objectContaining({ attemptCount: 1 }));
  });

  it("retries on transient failure and succeeds, logging the real attempt count", async () => {
    const sendEmail = jest
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce({ id: "msg-2", success: true });
    const adapter = { sendEmail } as unknown as ResendEmailAdapter;
    const service = new NotificationService(adapter, mockEmailLogRepo);

    const result = await service.send({ companyId: "company-1", to: "visitor@example.com", subject: "Hi", html: "<p>Hi</p>", templateName: "test" });

    expect(result.success).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(mockEmailLogRepo.updateLog).toHaveBeenCalledWith("log-1", "SENT", expect.objectContaining({ attemptCount: 2 }));
  });

  it("logs FAILED with the real error after exhausting retries", async () => {
    const adapter = { sendEmail: jest.fn().mockRejectedValue(new Error("Resend API down")) } as unknown as ResendEmailAdapter;
    const service = new NotificationService(adapter, mockEmailLogRepo);

    const result = await service.send({ companyId: "company-1", to: "visitor@example.com", subject: "Hi", html: "<p>Hi</p>", templateName: "test" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Resend API down");
    // maxRetries: 2 means 3 total attempts (initial + 2 retries)
    expect(adapter.sendEmail).toHaveBeenCalledTimes(3);
    expect(mockEmailLogRepo.updateLog).toHaveBeenCalledWith(
      "log-1",
      "FAILED",
      expect.objectContaining({ attemptCount: 3, errorMessage: expect.stringContaining("Resend API down") })
    );
  });
});
