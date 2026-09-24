import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authRequest: vi.fn(),
  getNotificationProviderSettings: vi.fn(),
  updateNotificationProviderSettings: vi.fn(),
  currentUser: { role: "owner" } as { role: string; permissions?: string[] }
}));

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
      title: "Member defaults", ownerRequired: "Owner required", privacy: "Privacy", notifications: "Notifications",
      notificationProvider: "Notification delivery provider", firebaseProvider: "Firebase", ntfyProvider: "ntfy",
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
    mocks.getNotificationProviderSettings.mockResolvedValue({ notificationProvider: "firebase" });
    mocks.updateNotificationProviderSettings.mockReset();
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
    return document.querySelector<HTMLSelectElement>('select[aria-label="Notification delivery provider"]')!;
  }

  async function selectProvider(select: HTMLSelectElement, provider: string) {
    select.value = provider;
    await act(async () => {
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
  }

  it("shows Firebase as the default provider", async () => {
    const select = await renderPage();
    expect(select.value).toBe("firebase");
    expect(mocks.getNotificationProviderSettings).toHaveBeenCalledWith("owner-token");
  });

  it("allows manage_server members to load and change the provider while keeping family defaults owner-only", async () => {
    mocks.currentUser = { role: "member", permissions: ["manage_server"] };
    mocks.updateNotificationProviderSettings.mockResolvedValue({ notificationProvider: "ntfy" });
    const select = await renderPage();
    expect(mocks.getNotificationProviderSettings).toHaveBeenCalledWith("owner-token");
    expect(select).toBeTruthy();
    expect(document.body.textContent).not.toContain("Profile visibility");
    await selectProvider(select, "ntfy");
    expect(mocks.updateNotificationProviderSettings).toHaveBeenCalledWith("owner-token", "ntfy");
    expect(select.value).toBe("ntfy");
  });

  it("locks the selector until a saved provider finishes loading", async () => {
    let resolveSettings!: (value: { notificationProvider: "firebase" | "ntfy" }) => void;
    const settingsPromise = new Promise<{ notificationProvider: "firebase" | "ntfy" }>((resolve) => { resolveSettings = resolve; });
    mocks.getNotificationProviderSettings.mockReturnValue(settingsPromise);
    const select = await renderPage();
    expect(select.disabled).toBe(true);

    await act(async () => { resolveSettings({ notificationProvider: "ntfy" }); });
    expect(select.disabled).toBe(false);
    expect(select.value).toBe("ntfy");
  });

  it("saves ntfy and reflects the server-confirmed selection", async () => {
    mocks.updateNotificationProviderSettings.mockResolvedValue({ notificationProvider: "ntfy" });
    const select = await renderPage();
    await selectProvider(select, "ntfy");

    expect(mocks.updateNotificationProviderSettings).toHaveBeenCalledWith("owner-token", "ntfy");
    expect(select.value).toBe("ntfy");
  });

  it("keeps the previous selection and shows an error when saving fails", async () => {
    mocks.updateNotificationProviderSettings.mockRejectedValue(new Error("write refused"));
    const select = await renderPage();
    await selectProvider(select, "ntfy");

    expect(select.value).toBe("firebase");
    expect(document.body.textContent).toContain("Could not save member defaults");
  });
});
