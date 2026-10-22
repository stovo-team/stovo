import { readCssSource } from "../test/cssSource";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const styles = readCssSource(resolve(process.cwd(), "src/styles.css"));

const mocks = vi.hoisted(() => ({
  authRequest: vi.fn(),
  currentUser: { role: "owner" } as { role: string; permissions?: string[] }
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ accessToken: "owner-token", authRequest: mocks.authRequest, currentUser: mocks.currentUser })
}));
vi.mock("../components/BackButton", () => ({ BackButton: () => null }));
vi.mock("./AppNav", () => ({ default: () => null }));
vi.mock("../i18n/LanguageContext", () => ({
  useStrings: () => ({
    admin: { backToAdmin: "Back", defaults: {
      title: "Member defaults", ownerRequired: "Owner required", privacy: "Privacy", notifications: "Notifications",
      saved: "Saved", loadError: "Could not load member defaults", saveError: "Could not save member defaults"
    } },
    privacy: { profileVisibility: "Profile visibility", everyone: "Everyone", nobody: "Nobody", lastSeen: "Last seen", readReceipts: "Read receipts" },
    notifications: {
      messageNotifications: "Messages", messagePreview: "Preview", messageSound: "Sound", callNotifications: "Calls",
      ringtoneEnabled: "Ringtone", muteNotifications: "Mute", start: "Start", end: "End"
    }
  })
}));

import AdminDefaultsPage from "./AdminDefaultsPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("AdminDefaultsPage notification provider", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    mocks.currentUser = { role: "owner" };
    mocks.authRequest.mockResolvedValue({ screenShareBitrateKbps: 5000 });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  async function renderPage() {
    await act(async () => { root?.render(<AdminDefaultsPage />); });
  }

  it("keeps server-only settings off the member defaults page", async () => {
    await renderPage();
    expect(document.body.textContent).not.toContain("Notification delivery provider");
    expect(document.body.textContent).not.toContain("Guest meeting quality");
    expect(document.querySelector<HTMLSelectElement>('select:not([aria-label="Notification delivery provider"])')?.classList.contains("admin-defaults-control")).toBe(true);
  });

  it("keeps member privacy and notification defaults available to owners", async () => {
    await renderPage();
    expect(document.body.textContent).toContain("Profile visibility");
    expect(document.body.textContent).toContain("Messages");
  });
});

describe("AdminDefaultsPage dropdown layout", () => {
  it("keeps member defaults controls compact while allowing them to shrink", () => {
    const desktopSizing = styles.match(/\.admin-page \.admin-panel \.admin-defaults-control\s*\{([^}]*)\}/)?.[1] ?? "";
    const mobileSizing = styles.match(/@media \(max-width: 600px\)[\s\S]*?\.admin-page \.admin-panel \.admin-defaults-control\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(desktopSizing).toMatch(/width: 240px;/);
    expect(desktopSizing).toMatch(/max-width: 42%;/);
    expect(desktopSizing).toMatch(/flex: 0 1 240px;/);
    expect(mobileSizing).toMatch(/width: 180px;/);
    expect(mobileSizing).toMatch(/max-width: 55%;/);
  });
});
