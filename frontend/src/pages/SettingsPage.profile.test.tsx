import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authRequest: vi.fn(),
  getMembers: vi.fn(),
  currentUser: { id: "owner-1", role: "owner", displayName: "Owner", email: "owner@example.com", bio: "", timezone: "UTC" },
  updateCurrentUser: vi.fn(),
  logout: vi.fn()
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ accessToken: "owner-token", authRequest: mocks.authRequest, currentUser: mocks.currentUser, updateCurrentUser: mocks.updateCurrentUser, logout: mocks.logout })
}));
vi.mock("../api/family", () => ({ getMembers: mocks.getMembers }));
vi.mock("../hooks/useFilePreviewUrl", () => ({ default: () => null }));
vi.mock("../api/notifications", () => ({ updateNativeNotificationSchedule: vi.fn() }));
vi.mock("../native/appLockPlugin", () => ({ authenticateAppLock: vi.fn(), getAppLockAvailability: vi.fn(), isAndroidAppLockAvailablePlatform: () => false }));
vi.mock("./AppNav", () => ({ default: () => null }));
vi.mock("./settings/SettingsDashboard", () => ({
  SettingsDashboard: ({ strings, onOpen }: { strings: { settings: { openProfileSettings: string } }; onOpen: (item: string) => void }) =>
    <button type="button" aria-label={strings.settings.openProfileSettings} onClick={() => onOpen("Profile")}>Profile</button>
}));
vi.mock("../appearance/AppearanceContext", async () => {
  const actual = await vi.importActual<typeof import("../appearance/AppearanceContext")>("../appearance/AppearanceContext");
  return { ...actual, useAppearance: () => ({ appearance: actual.DEFAULT_APPEARANCE, resolvedThemeMode: "dark" }) };
});
vi.mock("../i18n/LanguageContext", async () => {
  const { strings } = await import("../config/strings/english");
  return { useLanguage: () => ({ language: "en", setLanguage: vi.fn(), systemLanguage: "en", resolvedLanguage: "en", strings }) };
});

import SettingsPage from "./SettingsPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("SettingsPage profile save", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    mocks.authRequest.mockImplementation(async (path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
      if (path === "/api/family" && !options) return { id: "family-1", name: "Stakhov Family" };
      if (path === "/api/privacy/blocks") return [];
      if (path === "/api/auth/me" && options?.method === "PATCH") return { ...mocks.currentUser, ...options.body };
      throw new Error(`Unexpected request: ${path}`);
    });
    mocks.getMembers.mockResolvedValue([]);
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

  it("saves profile changes without patching the family name", async () => {
    await act(async () => { root?.render(<MemoryRouter><SettingsPage /></MemoryRouter>); });
    const openProfile = container?.querySelector<HTMLButtonElement>('button[aria-label="Open profile settings"]');
    expect(openProfile).toBeTruthy();
    await act(async () => { openProfile?.click(); });

    const profileForm = container?.querySelector<HTMLFormElement>(".settings-detail-panel form.profile-detail-form");
    const displayName = profileForm?.querySelector<HTMLInputElement>("input");
    expect(displayName).toBeTruthy();
    const setNativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    await act(async () => {
      setNativeValue?.call(displayName, "Updated Owner");
      displayName?.dispatchEvent(new Event("input", { bubbles: true }));
      profileForm?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(mocks.authRequest).toHaveBeenCalledWith("/api/auth/me", expect.objectContaining({ method: "PATCH" }));
    expect(mocks.authRequest.mock.calls.some(([path, options]) => path === "/api/family" && options?.method === "PATCH")).toBe(false);
  });
});
