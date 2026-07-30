import { TelemetryService } from "@/core/infrastructure/telemetry/OpenTelemetry";

// RedisCache and QueueService are now real (Redis/BullMQ-backed, see
// Phase 15-16) and are covered by dedicated tests that run against an
// actual Redis server: RedisCache.test.ts, QueueService.test.ts. The
// TelemetryService test below is still exercising the placeholder
// implementation pending its own real-OpenTelemetry replacement.
describe("Enterprise Infrastructure Subsystems", () => {
  it("should record and track execution latency via TelemetryService", () => {
    const telemetry = new TelemetryService();
    const span = telemetry.startSpan("PROMPT_GENERATION", { companyId: "comp-1" });
    telemetry.endSpan(span);

    const completed = telemetry.getCompletedSpans();
    expect(completed.length).toBe(1);
    expect(completed[0].name).toBe("PROMPT_GENERATION");
  });
});
