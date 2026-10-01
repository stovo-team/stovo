import type { Socket } from "socket.io-client";
import { waitForSocketConnection } from "../../../realtime/socketConnection";

export function waitForVoiceChannelConnection(
  socket: Socket,
  onAttempt: (attempt: number, totalAttempts: number) => void,
) {
  return waitForSocketConnection(socket, {
    // Keep retrying a slow initial namespace connection; the helper periodically
    // resets Engine.IO when its polling transport is alive but the namespace is wedged.
    attempts: 10,
    attemptTimeoutMs: 5_000,
    retryDelayMs: 500,
    onAttempt,
  });
}
