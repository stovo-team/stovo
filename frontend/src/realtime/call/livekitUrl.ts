type BrowserLocation = Pick<Location, "hostname" | "origin" | "port" | "protocol">;

const internalLiveKitHosts = new Set(["localhost", "127.0.0.1", "::1", "livekit"]);

/**
 * Turns a server-side LiveKit address into one a browser can reach.
 *
 * Docker services advertise `ws://livekit:7880`, which is resolvable only from
 * the backend network. For HTTPS deployments, Caddy exposes the LiveKit
 * WebSocket endpoint on the app origin, so guests do not need a separately
 * exposed port or a Docker hostname.
 */
export function resolveLiveKitUrl(value: string, location: BrowserLocation | null = typeof window === "undefined" ? null : window.location): string {
  if (!value || !location) return value;

  try {
    const url = new URL(value, location.origin);
    const isInternalEndpoint = internalLiveKitHosts.has(url.hostname);
    const isRemoteBrowser = !internalLiveKitHosts.has(location.hostname);

    if (isInternalEndpoint && isRemoteBrowser) {
      url.hostname = location.hostname;
      // A TLS-enabled app origin proxies /rtc to LiveKit. Using that proxy
      // avoids an unreachable :7880 port and keeps WebSocket TLS valid.
      if (location.protocol === "https:") {
        url.protocol = "wss:";
        url.port = location.port;
      }
    } else if (location.protocol === "https:" && url.protocol === "ws:") {
      url.protocol = "wss:";
    }

    return url.toString();
  } catch {
    return value;
  }
}
