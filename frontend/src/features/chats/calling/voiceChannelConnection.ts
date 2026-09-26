import type { Socket } from "socket.io-client";
import { waitForSocketConnection } from "../../../realtime/socketConnection";

export function waitForVoiceChannelConnection(
  socket: Socket,
  onAttempt: (attempt: number, totalAttempts: number) => void,
) {
  return waitForSocketConnection(socket, {
    // Cover Socket.IO's exponential backoff after a temporary disconnect.
    attempts: 8,
    attemptTimeoutMs: 5_000,
    retryDelayMs: 500,
    onAttempt,
  });
}
