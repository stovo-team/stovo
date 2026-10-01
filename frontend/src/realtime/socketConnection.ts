type SocketConnection = {
  connected: boolean;
  active?: boolean;
  connect: () => unknown;
  disconnect?: () => unknown;
  on: (event: "connect", listener: () => void) => unknown;
  off: (event: "connect", listener: () => void) => unknown;
};

type WaitForSocketConnectionOptions = {
  attempts?: number;
  attemptTimeoutMs?: number;
  retryDelayMs?: number;
  onAttempt?: (attempt: number, totalAttempts: number) => void;
};

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function waitForSingleConnection(
  socket: SocketConnection,
  timeoutMs: number,
): Promise<boolean> {
  if (socket.connected) return Promise.resolve(true);

  return new Promise((resolve) => {
    const onConnect = () => finish(true);
    const timeout = setTimeout(() => finish(socket.connected), timeoutMs);
    const finish = (connected: boolean) => {
      clearTimeout(timeout);
      socket.off("connect", onConnect);
      resolve(connected);
    };

    socket.on("connect", onConnect);
    // Let Socket.IO's manager finish or retry an in-flight handshake. Forcing a
    // namespace disconnect here can abandon a slow first session and create a
    // second one, which is both slower and can leave duplicate CONNECT packets.
    if (!socket.active) {
      socket.connect();
    }
  });
}

/** Wait before emitting a call lifecycle event into a reconnecting transport. */
export async function waitForSocketConnection(
  socket: SocketConnection,
  {
    attempts = 4,
    attemptTimeoutMs = 3_000,
    retryDelayMs = 750,
    onAttempt,
  }: WaitForSocketConnectionOptions = {},
): Promise<boolean> {
  if (socket.connected) return true;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    onAttempt?.(attempt, attempts);
    // Socket.IO owns transport recovery; wait for its connection event without
    // tearing down a namespace handshake that may still be completing.
    if (await waitForSingleConnection(socket, attemptTimeoutMs)) return true;
    if (attempt < attempts) await delay(retryDelayMs);
  }

  return false;
}
