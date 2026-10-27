import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  platform: "web",
  beginPasskeyRegistration: vi.fn(),
  finishPasskeyRegistration: vi.fn(),
  startRegistration: vi.fn(),
  authRequest: vi.fn(),
  getMembers: vi.fn(),
  currentUser: { id: "owner-1", role: "owner", displayName: "Owner", email: "owner@example.com", bio: "", timezone: "UTC", profilePhoto: null as import("../api/files").FamilyFile | null, avatarMode: "photo" as "photo" | "symbol" },
  updateCurrentUser: vi.fn(),
  logout: vi.fn()
}));

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => mocks.platform !== "web", getPlatform: () => mocks.platform }, registerPlugin: vi.fn(() => ({})) }));

vi.mock("../api/auth", () => ({ beginPasskeyRegistration: mocks.beginPasskeyRegistration, finishPasskeyRegistration: mocks.finishPasskeyRegistration, createAndroidQRLogin: vi.fn() }));
vi.mock("@simplewebauthn/browser", () => ({ startRegistration: mocks.startRegistration }));
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
  return {
    useLanguage: () => ({ language: "en", setLanguage: vi.fn(), systemLanguage: "en", resolvedLanguage: "en", strings }),
    useResolvedLanguage: () => "en",
    useStrings: () => strings,
  };
});

import SettingsPage from "./SettingsPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("SettingsPage profile save", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    mocks.platform = "web";
    mocks.currentUser.profilePhoto = null;
    mocks.currentUser.avatarMode = "photo";
    Object.assign(mocks.currentUser, { avatarColorId: null });
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    Object.defineProperty(window, "PublicKeyCredential", { configurable: true, value: class PublicKeyCredential {} });
    mocks.beginPasskeyRegistration.mockResolvedValue({ ceremonyId: "registration-1", publicKey: { challenge: "challenge" } });
    mocks.startRegistration.mockReset().mockResolvedValue({ id: "credential-1" });
    mocks.finishPasskeyRegistration.mockResolvedValue({});
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
    delete (window as Window & { isSecureContext?: boolean }).isSecureContext;
    delete (window as Window & { PublicKeyCredential?: unknown }).PublicKeyCredential;
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
  it("keeps person initials when a profile color is set", async () => {
    Object.assign(mocks.currentUser, { avatarColorId: "purple" });
    await act(async () => { root?.render(<MemoryRouter><SettingsPage /></MemoryRouter>); });
    await act(async () => container?.querySelector<HTMLButtonElement>('button[aria-label="Open profile settings"]')?.click());

    expect(container?.querySelector('.entity-avatar[data-avatar-color="purple"] .avatar-initials')?.textContent).toBe("OW");
    expect(mocks.authRequest).not.toHaveBeenCalledWith("/api/auth/me", expect.objectContaining({ method: "PATCH" }));
  });
  it("keeps the uploaded profile photo available through the photo control", async () => {
    const photo = {
      id: "profile-photo-1", familyId: "family-1", uploadedBy: "owner-1", chatId: null, chatTitle: null,
      chatType: null, originMessageId: null, accessScope: "family" as const, storageProvider: "local",
      originalName: "profile.png", mimeType: "image/png", sizeBytes: 1024, checksum: null,
      createdAt: "2026-10-01T00:00:00.000Z", deletedAt: null, isFavorite: false
    };
    mocks.currentUser.profilePhoto = photo;
    await act(async () => { root?.render(<MemoryRouter><SettingsPage /></MemoryRouter>); });
    await act(async () => container?.querySelector<HTMLButtonElement>('button[aria-label="Open profile settings"]')?.click());

    expect(container?.querySelector('button[aria-label="Change profile photo"]') && container.querySelector<HTMLInputElement>('input[type="file"][accept="image/jpeg,image/png,image/gif,image/webp"]') && mocks.currentUser.profilePhoto).toBe(photo);
  });
  async function openPasskeys() {
    await act(async () => { root?.render(<MemoryRouter><SettingsPage /></MemoryRouter>); });
    await act(async () => container?.querySelector<HTMLButtonElement>('button[aria-label="Open profile settings"]')?.click());
    return [...container!.querySelectorAll("button")].find((button) => button.textContent === "Add a passkey")!;
  }
  it("enrolls a passkey on supported Android", async () => {
    mocks.platform = "android";
    const button = await openPasskeys();
    expect(button.disabled).toBe(false);
    await act(async () => button.click());
    expect(mocks.beginPasskeyRegistration).toHaveBeenCalledWith("owner-token");
    expect(mocks.finishPasskeyRegistration).toHaveBeenCalledWith("owner-token", "registration-1", { id: "credential-1" });
    expect(container?.textContent).toContain("Passkey added");
  });
  it.each(["missing API", "insecure context", "ios"])("keeps enrollment unavailable with %s", async (reason) => {
    mocks.platform = reason === "ios" ? "ios" : "android";
    if (reason !== "ios") Object.defineProperty(window, reason === "missing API" ? "PublicKeyCredential" : "isSecureContext", { configurable: true, value: reason === "missing API" ? undefined : false });
    const button = await openPasskeys();
    expect(button.disabled).toBe(true);
    expect(container?.textContent).toContain("Passkeys require HTTPS and a supported browser");
    expect(container?.querySelector('input[autocomplete="current-password"]')).not.toBeNull();
  });
  it.each(["NotAllowedError", "AbortError", "UnknownError"])("allows enrollment retry after %s", async (name) => {
    mocks.platform = "android";
    mocks.startRegistration.mockRejectedValueOnce(new DOMException("provider error", name));
    const button = await openPasskeys();
    expect(button.disabled).toBe(false);
    await act(async () => button.click());
    expect(container?.textContent?.includes("Could not add passkey")).toBe(name === "UnknownError");
    expect(mocks.finishPasskeyRegistration).not.toHaveBeenCalled();
    expect(button.disabled).toBe(false);
    await act(async () => button.click());
    expect(mocks.finishPasskeyRegistration).toHaveBeenCalledOnce();
  });

});
