import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getActiveManifest,
  setActiveManifest,
  fetchServerManifest,
  defaultManifest,
} from "./profileManifest";

describe("profileManifest", () => {
  beforeEach(() => {
    setActiveManifest(defaultManifest);
  });

  it("returns default family manifest initially", () => {
    const manifest = getActiveManifest();
    expect(manifest.profile).toBe("family");
    expect(manifest.screens.chats).toBe(true);
    expect(manifest.screens.game_activity).toBe(false);
  });

  it("updates manifest when setActiveManifest is called", () => {
    setActiveManifest({
      profile: "gamer",
      screens: { ...defaultManifest.screens, game_activity: true },
    });
    const manifest = getActiveManifest();
    expect(manifest.profile).toBe("gamer");
    expect(manifest.screens.game_activity).toBe(true);
  });

  it("fetches manifest from endpoint successfully", async () => {
    const mockGamerManifest = {
      profile: "gamer",
      display_name: "Gamer Solution",
      screens: { ...defaultManifest.screens, game_activity: true, voice_rooms: true },
      features: { ...defaultManifest.features, default_theme: "gamer_dark" },
      active_plugins: ["plugin-gamer-presence"],
    };

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockGamerManifest,
    } as Response);

    const result = await fetchServerManifest();
    expect(result.profile).toBe("gamer");
    expect(result.screens.game_activity).toBe(true);
  });
});
