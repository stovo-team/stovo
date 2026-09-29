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
  restartNamespace = false,
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
    // Socket.IO's connect() is not idempotent while the namespace handshake is
    // pending; calling it on each retry queues duplicate CONNECT packets. The
    // active socket already has its own reconnection loop, so only start sockets
    // that are not active.
    if (restartNamespace && socket.disconnect) {
      socket.disconnect();
      socket.connect();
    } else if (!socket.active) {
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
    // A Socket.IO manager can keep its Engine.IO polling transport alive while
    // the namespace handshake is wedged. In that state `active` is true, so
    // connect() is normally a no-op and the call event is never emitted. Give
    // the normal reconnect a window, then periodically reset the namespace.
    const restartNamespace = attempt > 1 && attempt % 2 === 0 && socket.active === true;
    if (await waitForSingleConnection(socket, attemptTimeoutMs, restartNamespace)) return true;
    if (attempt < attempts) await delay(retryDelayMs);
  }

  return false;
}
