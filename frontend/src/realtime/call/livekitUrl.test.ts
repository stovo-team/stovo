import { describe, expect, it } from "vitest";
import { resolveLiveKitUrl } from "./livekitUrl";

const location = (origin: string) => {
  const url = new URL(origin);
  return { origin: url.origin, protocol: url.protocol, hostname: url.hostname, port: url.port } as Location;
};

describe("resolveLiveKitUrl", () => {
  it("replaces the Docker hostname for a LAN browser", () => {
    expect(resolveLiveKitUrl("ws://livekit:7880", location("http://192.168.1.25:5173"))).toBe("ws://192.168.1.25:7880/");
  });

  it("uses the TLS app origin for an internal endpoint", () => {
    expect(resolveLiveKitUrl("ws://livekit:7880", location("https://stovo.example.test"))).toBe("wss://stovo.example.test/");
  });

  it("upgrades a public WebSocket endpoint on an HTTPS page", () => {
    expect(resolveLiveKitUrl("ws://media.example.test:7880", location("https://stovo.example.test"))).toBe("wss://media.example.test:7880/");
  });

  it("leaves an already public TLS endpoint unchanged", () => {
    expect(resolveLiveKitUrl("wss://media.example.test", location("https://stovo.example.test"))).toBe("wss://media.example.test/");
  });
});
