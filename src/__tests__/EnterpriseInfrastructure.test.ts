import { RedisCache } from "@/core/infrastructure/cache/RedisCache";
import { QueueService } from "@/core/infrastructure/queue/QueueService";
import { TelemetryService } from "@/core/infrastructure/telemetry/OpenTelemetry";

describe("Enterprise Infrastructure Subsystems", () => {
  it("should set and retrieve item from RedisCache with TTL", async () => {
    const cache = new RedisCache();
    await cache.set("test_key", { company: "Acme Corp" }, 10);
    const item = await cache.get<{ company: string }>("test_key");

    expect(item).not.toBeNull();
    expect(item?.company).toBe("Acme Corp");
  });

  it("should process asynchronous jobs sequentially via QueueService", async () => {
    const queue = new QueueService();
    await queue.enqueue("EMAIL_DISPATCH", { to: "user@example.com" });
    expect(queue.getPendingJobsCount()).toBe(1);

    const job = await queue.processNextJob();
    expect(job?.name).toBe("EMAIL_DISPATCH");
    expect(queue.getPendingJobsCount()).toBe(0);
  });

  it("should record and track execution latency via TelemetryService", () => {
    const telemetry = new TelemetryService();
    const span = telemetry.startSpan("PROMPT_GENERATION", { companyId: "comp-1" });
    telemetry.endSpan(span);

    const completed = telemetry.getCompletedSpans();
    expect(completed.length).toBe(1);
    expect(completed[0].name).toBe("PROMPT_GENERATION");
  });
});
