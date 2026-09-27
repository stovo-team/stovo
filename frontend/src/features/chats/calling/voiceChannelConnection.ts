import type { Socket } from "socket.io-client";
import { waitForSocketConnection } from "../../../realtime/socketConnection";

export function waitForVoiceChannelConnection(
  socket: Socket,
  onAttempt: (attempt: number, totalAttempts: number) => void,
) {
  return waitForSocketConnection(socket, {
    // Recover a live Engine.IO transport with a wedged Socket.IO namespace
    // promptly; the helper resets that namespace once on its second attempt.
    attempts: 3,
    attemptTimeoutMs: 5_000,
    retryDelayMs: 500,
    onAttempt,
  });
}
