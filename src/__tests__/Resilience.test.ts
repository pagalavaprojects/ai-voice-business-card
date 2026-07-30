import { withExponentialBackoff, CircuitBreaker } from "@/shared/lib/resilience";

describe("Resilience Infrastructure (Exponential Backoff & Circuit Breaker)", () => {
  it("should retry failing operations up to maxRetries before throwing", async () => {
    let attempts = 0;
    const failingFn = async () => {
      attempts++;
      if (attempts < 3) throw new Error("Temporary network error");
      return "SUCCESS";
    };

    const result = await withExponentialBackoff(failingFn, { maxRetries: 3, initialDelayMs: 10 });
    expect(result).toBe("SUCCESS");
    expect(attempts).toBe(3);
  });

  it("should trip CircuitBreaker OPEN after reaching failure threshold", async () => {
    const breaker = new CircuitBreaker(2, 1000);
    const failFn = async () => {
      throw new Error("API Down");
    };

    await expect(breaker.execute(failFn)).rejects.toThrow("API Down");
    await expect(breaker.execute(failFn)).rejects.toThrow("API Down");
    expect(breaker.getState()).toBe("OPEN");

    await expect(breaker.execute(failFn)).rejects.toThrow("CircuitBreaker is OPEN");
  });
});
