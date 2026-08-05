const SOCKET_POLLING_OVERRIDE_STORAGE_KEY = "familyMessenger.socket.forcePollingFirst";

function readSocketForcePollingOverride() {
  const envValue = import.meta.env.VITE_SOCKET_FORCE_POLLING_FIRST;
  if (typeof envValue === "string") {
    const normalized = envValue.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
      return false;
    }
  }

  if (typeof window === "undefined") {
    return null;
  }

  const storedValue = window.localStorage.getItem(SOCKET_POLLING_OVERRIDE_STORAGE_KEY);
  if (storedValue === null) {
    return null;
  }
  const normalized = storedValue.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
    return false;
  }
  return null;
}

export function preferPollingFirst(hostname: string) {
  const override = readSocketForcePollingOverride();
  if (override !== null) {
    return override;
  }
  // Capacitor (Android/iOS) injects window.Capacitor at runtime. The
  // doquangtan/socketio server library only populates socket.Handshake.URL
  // for polling connections — WebSocket connections leave it empty, so the
  // server cannot extract the auth token and immediately disconnects the
  // socket. Force polling-first on native platforms so the handshake URL
  // (which contains the token query param) is always available to the server.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cap = typeof window !== "undefined" ? (window as any).Capacitor : undefined;
  if (cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) {
    return true;
  }
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1") {
    return false;
  }
  return true;
}
