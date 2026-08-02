import { describe, expect, it, vi } from "vitest";

import { waitForSocketConnection } from "./socketConnection";

type ConnectHandler = () => void;

function createSocket(connectOutcomes: boolean[]) {
  const handlers = new Set<ConnectHandler>();
  let connectionAttempt = 0;
  return {
    connected: false,
    connect: vi.fn(function (this: { connected: boolean }) {
      const connects = connectOutcomes[connectionAttempt++] ?? false;
      if (connects) {
        this.connected = true;
        handlers.forEach((handler) => handler());
      }
    }),
    on: vi.fn((_event: "connect", handler: ConnectHandler) => handlers.add(handler)),
    off: vi.fn((_event: "connect", handler: ConnectHandler) => handlers.delete(handler)),
  };
}

describe("waitForSocketConnection", () => {
  it("retries a reconnecting socket until it becomes available", async () => {
    vi.useFakeTimers();
    const socket = createSocket([false, false, true]);

    const connected = waitForSocketConnection(socket, {
      attempts: 3,
      attemptTimeoutMs: 100,
      retryDelayMs: 50,
    });
    await vi.advanceTimersByTimeAsync(300);

    await expect(connected).resolves.toBe(true);
    expect(socket.connect).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("reports each retry attempt so the call UI can show reconnecting status", async () => {
    vi.useFakeTimers();
    const socket = createSocket([false, false]);
    const onAttempt = vi.fn();

    const connected = waitForSocketConnection(socket, {
      attempts: 2,
      attemptTimeoutMs: 100,
      retryDelayMs: 50,
      onAttempt,
    });
    await vi.advanceTimersByTimeAsync(250);

    await expect(connected).resolves.toBe(false);
    expect(onAttempt).toHaveBeenNthCalledWith(1, 1, 2);
    expect(onAttempt).toHaveBeenNthCalledWith(2, 2, 2);
    vi.useRealTimers();
  });
});
