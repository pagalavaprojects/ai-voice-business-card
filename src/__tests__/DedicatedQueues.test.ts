import { EmailQueue } from "@/core/infrastructure/queue/EmailQueue";
import { CRMQueue } from "@/core/infrastructure/queue/CRMQueue";

describe("Dedicated Queue Processing Subsystems", () => {
  it("should enqueue and process transactional email jobs via EmailQueue", async () => {
    const emailQueue = new EmailQueue();
    await emailQueue.enqueueEmail({
      to: "lead@example.com",
      subject: "Meeting Confirmation",
      html: "<p>Your booking is confirmed.</p>",
    });

    const result = await emailQueue.processNextEmail();
    expect(result).not.toBeNull();
    expect(result?.success).toBe(true);
  });

  it("should enqueue and process lead CRM sync jobs via CRMQueue", async () => {
    const crmQueue = new CRMQueue();
    await crmQueue.enqueueLeadSync({
      company_id: "11111111-1111-1111-1111-111111111111",
      employee_id: "22222222-2222-2222-2222-222222222222",
      name: "John Doe",
      email: "john@example.com",
      phone: "+15550192831",
    });

    const lead = await crmQueue.processNextLeadSync();
    expect(lead).not.toBeNull();
    expect(lead?.name).toBe("John Doe");
  });
});
