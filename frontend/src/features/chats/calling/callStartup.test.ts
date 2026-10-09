import { describe, expect, it, vi } from "vitest";
import { launchCallStartup } from "./callStartup";

describe("call startup", () => {
  it("shows the outgoing state before asynchronous setup finishes", async () => {
    let phase = "idle";
    let finishSetup!: () => void;
    const onError = vi.fn();

    const startup = launchCallStartup(
      () => { phase = "outgoing"; },
      () => new Promise<void>((resolve) => { finishSetup = resolve; }),
      onError
    );

    expect(phase).toBe("outgoing");
    expect(onError).not.toHaveBeenCalled();
    await Promise.resolve();
    finishSetup();
    await startup;
  });
});
