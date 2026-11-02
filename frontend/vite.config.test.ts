import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
it("runs CI test files in two workers to limit memory pressure on self-hosted runners", async () => {
  vi.stubEnv("CI", "true");
  const { default: config } = await import("./vite.config");
  expect(config.test?.maxWorkers).toBe(2);
});
it("retains automatic local worker selection outside CI", async () => {
  vi.stubEnv("CI", undefined);
  const { default: config } = await import("./vite.config");
  expect(config.test?.maxWorkers).toBeUndefined();
});
it("allows overriding CI workers via VITEST_MAX_WORKERS", async () => {
  vi.stubEnv("CI", "true");
  vi.stubEnv("VITEST_MAX_WORKERS", "4");
  const { default: config } = await import("./vite.config");
  expect(config.test?.maxWorkers).toBe(4);
});
