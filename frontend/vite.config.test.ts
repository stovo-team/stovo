import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
it("runs CI test files in one worker to bound self-hosted runner memory", async () => {
  vi.stubEnv("CI", "true");
  const { default: config } = await import("./vite.config");
  expect(config.test?.maxWorkers).toBe(1);
});
it("retains automatic local worker selection outside CI", async () => {
  vi.stubEnv("CI", undefined);
  const { default: config } = await import("./vite.config");
  expect(config.test?.maxWorkers).toBeUndefined();
});
