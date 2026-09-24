import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authRequest: vi.fn(),
  getNotificationProviderSettings: vi.fn(),
  updateNotificationProviderSettings: vi.fn(),
  currentUser: { role: "owner" } as { role: string; permissions?: string[] }
}));
const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ accessToken: "owner-token", authRequest: mocks.authRequest, currentUser: mocks.currentUser })
}));
vi.mock("../api/admin", () => ({
  getNotificationProviderSettings: mocks.getNotificationProviderSettings,
  updateNotificationProviderSettings: mocks.updateNotificationProviderSettings
}));
vi.mock("../components/BackButton", () => ({ BackButton: () => null }));
vi.mock("./AppNav", () => ({ default: () => null }));
vi.mock("../i18n/LanguageContext", () => ({
  useStrings: () => ({
    admin: { backToAdmin: "Back", defaults: {
      notifications: "Notifications", notificationProvider: "Notification delivery provider", firebaseProvider: "Firebase", ntfyProvider: "ntfy"
    }, serverSettings: {
      title: "Server settings", ownerRequired: "Owner required", guestMeetingQuality: "Guest meeting quality",
      screenShareBitrate: "Screen-share bitrate (kbps)", storageAndRetention: "Storage and retention",
      fileCompression: "File compression", fileCompressionHelp: "Optimize media and documents", optimizeSize: "Optimize size",
      messageRetention: "Message retention", messageRetentionHelp: "Keep messages", inactiveUserDeletion: "Inactive user deletion",
      inactiveUserDeletionHelp: "Remove inactive users", never: "Never", saved: "Saved",
      loadError: "Could not load server settings", saveError: "Could not save server settings"
    }, encryption: { premium: "Premium" } },
    privacy: { profileVisibility: "Profile visibility" }
  })
}));

import AdminServerSettingsPage from "./AdminServerSettingsPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("AdminServerSettingsPage", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    mocks.currentUser = { role: "owner" };
    mocks.authRequest.mockResolvedValue({ screenShareBitrateKbps: 5000 });
    mocks.getNotificationProviderSettings.mockResolvedValue({ notificationProvider: "firebase" });
    mocks.updateNotificationProviderSettings.mockResolvedValue({ notificationProvider: "ntfy" });
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
    await act(async () => { root?.render(<AdminServerSettingsPage />); });
  }

  it("shows and saves the server notification provider", async () => {
    await renderPage();
    const select = document.querySelector<HTMLSelectElement>('select[aria-label="Notification delivery provider"]')!;
    expect(select.value).toBe("firebase");
    expect(mocks.getNotificationProviderSettings).toHaveBeenCalledWith("owner-token");

    select.value = "ntfy";
    await act(async () => {
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    expect(mocks.updateNotificationProviderSettings).toHaveBeenCalledWith("owner-token", "ntfy");
    expect(select.value).toBe("ntfy");
  });

  it("keeps guest meeting quality editable and saves a valid bitrate", async () => {
    await renderPage();
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Screen-share bitrate (kbps)"]')!;
    expect(input.value).toBe("5000");
    input.value = "6000";
    await act(async () => {
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new Event("blur", { bubbles: true }));
      await Promise.resolve();
    });
    expect(mocks.authRequest).toHaveBeenCalledWith("/api/family", { method: "PATCH", body: { screenShareBitrateKbps: 6000 } });
  });

  it("shows premium retention and compression defaults as locked controls", async () => {
    await renderPage();
    const compression = document.querySelector<HTMLSelectElement>('select[aria-label="File compression"]')!;
    const messageTtl = document.querySelector<HTMLSelectElement>('select[aria-label="Message retention"]')!;
    const inactiveUsers = document.querySelector<HTMLSelectElement>('select[aria-label="Inactive user deletion"]')!;
    expect(compression.value).toBe("optimize-size");
    expect(messageTtl.value).toBe("never");
    expect(inactiveUsers.value).toBe("never");
    expect(compression.disabled && messageTtl.disabled && inactiveUsers.disabled).toBe(true);
    expect(document.querySelectorAll(".premium-feature-badge")).toHaveLength(3);
    expect(mocks.authRequest).toHaveBeenCalledTimes(1);
    expect(mocks.updateNotificationProviderSettings).not.toHaveBeenCalled();
  });

  it("keeps the premium badge compact within its settings row", () => {
    const badgeRule = styles.match(/\.admin-page \.appearance-setting-row \.premium-feature-badge\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(badgeRule).toMatch(/flex: 0 0 auto;/);
  });

  it("allows manage_server members to update the notification provider", async () => {
    mocks.currentUser = { role: "member", permissions: ["manage_server"] };
    await renderPage();
    const select = document.querySelector<HTMLSelectElement>('select[aria-label="Notification delivery provider"]')!;
    expect(select.value).toBe("firebase");
    expect(document.body.textContent).not.toContain("Guest meeting quality");
    expect(mocks.authRequest).not.toHaveBeenCalled();
    select.value = "ntfy";
    await act(async () => {
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    expect(mocks.updateNotificationProviderSettings).toHaveBeenCalledWith("owner-token", "ntfy");
  });

  it("hides server settings from members without manage_server access", async () => {
    mocks.currentUser = { role: "member", permissions: [] };
    await renderPage();
    expect(document.body.textContent).toContain("Owner required");
    expect(document.body.textContent).not.toContain("Notification delivery provider");
    expect(document.body.textContent).not.toContain("File compression");
    expect(mocks.authRequest).not.toHaveBeenCalled();
    expect(mocks.getNotificationProviderSettings).not.toHaveBeenCalled();
  });

  it("shows a load error and keeps the provider selector disabled when the settings request fails", async () => {
    mocks.getNotificationProviderSettings.mockRejectedValue(new Error("offline"));
    await renderPage();
    expect(document.body.textContent).toContain("Could not load server settings");
    expect(document.querySelector<HTMLSelectElement>('select[aria-label="Notification delivery provider"]')?.disabled).toBe(true);
  });
});
