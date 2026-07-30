import { RedisMemoryServer } from "redis-memory-server";
import { closeRedisClient } from "@/core/infrastructure/cache/redisClient";

// EmailQueue/CRMQueue construct their own ResendEmailAdapter/
// SupabaseCRMRepository internally rather than taking them as
// constructor params, so those two are mocked here (no live Resend key
// or Supabase project exists in this environment) — but the queue
// mechanics themselves (enqueue, a real BullMQ worker picking the job up,
// dead-letter on exhausted retries) run against a real Redis server, not
// mocked.
jest.mock("@/core/infrastructure/email/ResendEmailAdapter", () => ({
  ResendEmailAdapter: jest.fn().mockImplementation(() => ({
    sendEmail: jest.fn().mockResolvedValue({ id: "msg-mock-1", success: true }),
  })),
}));

jest.mock("@/core/infrastructure/database/supabase/SupabaseCRMRepository", () => ({
  SupabaseCRMRepository: jest.fn().mockImplementation(() => ({
    createLead: jest.fn().mockImplementation((data) => Promise.resolve({ id: "lead-mock-1", ...data })),
  })),
}));

jest.mock("@/core/infrastructure/database/supabase/SupabaseEmailLogRepository", () => ({
  SupabaseEmailLogRepository: jest.fn().mockImplementation(() => ({
    updateLog: jest.fn().mockResolvedValue({}),
  })),
}));

import { EmailQueue } from "@/core/infrastructure/queue/EmailQueue";
import { CRMQueue } from "@/core/infrastructure/queue/CRMQueue";

describe("Dedicated Queue Processing Subsystems (real Redis + real BullMQ worker)", () => {
  let server: RedisMemoryServer;

  beforeAll(async () => {
    server = await RedisMemoryServer.create();
    const host = await server.getHost();
    const port = await server.getPort();
    process.env.REDIS_URL = `redis://${host}:${port}`;
  }, 30000);

  afterAll(async () => {
    await closeRedisClient();
    await server.stop();
  });

  it("enqueues and processes a transactional email job via a real worker", async () => {
    const emailQueue = new EmailQueue();
    const worker = emailQueue.startWorker();

    const completed = new Promise((resolve) => worker.on("completed", resolve));

    await emailQueue.enqueueEmail(
      { to: "lead@example.com", subject: "Meeting Confirmation", html: "<p>Your booking is confirmed.</p>" },
      "email-log-1"
    );

    await completed;
    await worker.close();
    await emailQueue.close();
  }, 15000);

  it("enqueues and processes a CRM lead sync job via a real worker", async () => {
    const crmQueue = new CRMQueue();
    const worker = crmQueue.startWorker();

    const completed = new Promise((resolve) => worker.on("completed", resolve));

    await crmQueue.enqueueLeadSync({
      company_id: "11111111-1111-1111-1111-111111111111",
      employee_id: "22222222-2222-2222-2222-222222222222",
      name: "John Doe",
      email: "john@example.com",
      phone: "+15550192831",
    });

    await completed;
    await worker.close();
    await crmQueue.close();
  }, 15000);
});
