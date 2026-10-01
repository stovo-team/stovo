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
const styles = readFileSync(resolve(process.cwd(), "src/pages/AdminServerSettingsPage.css"), "utf8");
const globalStyles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

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
      aiFunctions: "AI functions", translation: "Translation", callRecording: "Call recording", aiNotes: "AI notes", voiceTranscription: "Voice message transcription",
      spaceName: "Space Name",
      screenShareBitrate: "Screen-share bitrate (kbps)", cameraBitrate: "Camera bitrate (kbps)",
      groupCallsQuality: "Group calls & voice chats", dmCallsQuality: "DM calls",
      safetyAndModeration: "Safety & moderation", disallowedFileTypes: "Disallowed file types",
      contentSafetyChecks: "Content safety checks", antispam: "Antispam", storageAndRetention: "Storage and retention",
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
    mocks.authRequest.mockResolvedValue({ name: "Stakhov Family", cameraBitrateKbps: 4500, groupCallCameraBitrateKbps: 6000, dmCallCameraBitrateKbps: 7500 });
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

  async function chooseOption(ariaLabel: string, value: string) {
    const trigger = document.querySelector<HTMLButtonElement>(`button[aria-label^="${ariaLabel}"]`)!;
    if (trigger.getAttribute("aria-expanded") !== "true") await act(async () => { trigger.click(); });
    const option = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find((candidate) => candidate.textContent?.trim() === value)!;
    await act(async () => { option.click(); await Promise.resolve(); });
  }

  async function changeBitrate(input: HTMLInputElement, value: string) {
    const setNativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    await act(async () => {
      setNativeValue?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      await Promise.resolve();
    });
    return input;
  }

  const bitrateSettings = [
    { section: "Guest meeting quality", label: "Screen-share bitrate (kbps)", field: "screenShareBitrateKbps", initial: 5000, changed: 5500 },
    { section: "Guest meeting quality", label: "Camera bitrate (kbps)", field: "cameraBitrateKbps", initial: 4500, changed: 6000 },
    { section: "Group calls & voice chats", label: "Screen-share bitrate (kbps)", field: "groupCallScreenShareBitrateKbps", initial: 7000, changed: 7500 },
    { section: "Group calls & voice chats", label: "Camera bitrate (kbps)", field: "groupCallCameraBitrateKbps", initial: 6000, changed: 6500 },
    { section: "DM calls", label: "Screen-share bitrate (kbps)", field: "dmCallScreenShareBitrateKbps", initial: 8000, changed: 8500 },
    { section: "DM calls", label: "Camera bitrate (kbps)", field: "dmCallCameraBitrateKbps", initial: 7500, changed: 9000 }
  ] as const;

  const initialBitrateSettings = Object.fromEntries(bitrateSettings.map(({ field, initial }) => [field, initial]));

  function sectionInput(sectionName: string, label: string) {
    const heading = [...document.querySelectorAll("h2")].find((candidate) => candidate.textContent?.trim() === sectionName);
    return heading?.closest("section")?.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`) ?? null;
  }

  it("shows and saves the server notification provider", async () => {
    await renderPage();
    const trigger = document.querySelector<HTMLButtonElement>('button[aria-label^="Notification delivery provider"]')!;
    expect(trigger.textContent).toContain("Firebase");
    expect(trigger.getAttribute("aria-label")).toContain("Firebase");
    await act(async () => { trigger.click(); });
    expect(document.querySelector('[role="listbox"][aria-label="Notification delivery provider"]')).toBeTruthy();
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(2);
    expect(mocks.getNotificationProviderSettings).toHaveBeenCalledWith("owner-token");
    await chooseOption("Notification delivery provider", "ntfy");
    expect(mocks.updateNotificationProviderSettings).toHaveBeenCalledWith("owner-token", "ntfy");
    expect(trigger.textContent).toContain("ntfy");
  });

  it("allows an admin to edit the space name", async () => {
    mocks.currentUser = { role: "admin", permissions: ["manage_server"] };
    await renderPage();
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Space Name"]');
    expect(input?.value).toBe("Stakhov Family");
    expect(input?.disabled).toBe(false);
    expect(mocks.authRequest).toHaveBeenCalledWith("/api/family");
  });

  it("supports keyboard navigation and restores focus when the provider menu closes", async () => {
    await renderPage();
    const trigger = document.querySelector<HTMLButtonElement>('button[aria-label^="Notification delivery provider"]')!;
    await act(async () => { trigger.click(); });
    const firebaseOption = document.querySelector<HTMLButtonElement>('[role="option"][aria-selected="true"]')!;
    expect(document.activeElement).toBe(firebaseOption);
    await act(async () => { firebaseOption.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); });
    const ntfyOption = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find((option) => option.textContent?.includes("ntfy"))!;
    expect(document.activeElement).toBe(ntfyOption);
    await act(async () => { ntfyOption.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(mocks.updateNotificationProviderSettings).toHaveBeenCalledWith("owner-token", "ntfy");

    await act(async () => { trigger.click(); });
    await act(async () => { document.querySelector('[role="listbox"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(document.activeElement).toBe(trigger);
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it("does not expose screen-share bitrate controls", async () => {
    await renderPage();
    expect(document.body.textContent).not.toContain("Screen-share bitrate");
    expect(document.querySelector('input[aria-label="Screen-share bitrate (kbps)"]')).toBeNull();
  });

  it("edits and saves the space name from server settings", async () => {
    mocks.authRequest
      .mockResolvedValueOnce({ name: "Stakhov Family", screenShareBitrateKbps: 5000 })
      .mockResolvedValueOnce({ name: "New Space", screenShareBitrateKbps: 5000 });
    await renderPage();
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Space Name"]')!;
    expect(input.value).toBe("Stakhov Family");
    const setNativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    await act(async () => {
      setNativeValue?.call(input, "  New Space  ");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      await Promise.resolve();
    });
    expect(mocks.authRequest).toHaveBeenCalledWith("/api/family", { method: "PATCH", body: { name: "New Space" } });
  });

  it("does not save a blank or unchanged space name", async () => {
    mocks.authRequest.mockResolvedValue({ name: "Stakhov Family", screenShareBitrateKbps: 5000 });
    await renderPage();
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Space Name"]')!;
    await act(async () => {
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      await Promise.resolve();
    });
    expect(mocks.authRequest).toHaveBeenCalledTimes(1);
    const setNativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    await act(async () => {
      setNativeValue?.call(input, "   ");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      await Promise.resolve();
    });
    expect(mocks.authRequest).toHaveBeenCalledTimes(1);
    expect(input.value).toBe("Stakhov Family");
  });

  it("shows only the camera bitrate control for guest meetings", async () => {
    await renderPage();
    expect(document.querySelector<HTMLInputElement>('input[aria-label="Screen-share bitrate (kbps)"]')).toBeNull();
    expect(document.querySelector<HTMLInputElement>('input[aria-label="Camera bitrate (kbps)"]')).toBeTruthy();
  });

  it("initializes camera bitrate controls from the family settings response", async () => {
    mocks.authRequest.mockResolvedValue({ name: "Stakhov Family", ...initialBitrateSettings });
    await renderPage();
    for (const setting of bitrateSettings.filter(({ field }) => field.toLowerCase().includes("camera"))) {
      expect(sectionInput(setting.section, setting.label)?.value).toBe(String(setting.initial));
    }
  });

  it.each(bitrateSettings.filter(({ field }) => field.toLowerCase().includes("camera")))("saves only $field when its bitrate control changes", async (setting) => {
    mocks.authRequest.mockResolvedValue({ name: "Stakhov Family", ...initialBitrateSettings });
    await renderPage();
    const input = sectionInput(setting.section, setting.label);
    expect(input).toBeTruthy();
    const target = input!;
    const setNativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    await act(async () => {
      setNativeValue?.call(target, String(setting.changed));
      target.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });
    for (const otherSetting of bitrateSettings.filter((candidate) => candidate.field.toLowerCase().includes("camera") && candidate.field !== setting.field)) {
      expect(sectionInput(otherSetting.section, otherSetting.label)?.value).toBe(String(otherSetting.initial));
    }
    await act(async () => {
      target.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      await Promise.resolve();
    });
    expect(mocks.authRequest).toHaveBeenLastCalledWith("/api/family", {
      method: "PATCH",
      body: { [setting.field]: setting.changed }
    });
  });

  it.each(bitrateSettings.filter(({ field }) => field.toLowerCase().includes("camera")))("does not save invalid $field values and restores its current value", async (setting) => {
    mocks.authRequest.mockResolvedValue({ name: "Stakhov Family", ...initialBitrateSettings });
    await renderPage();
    const input = sectionInput(setting.section, setting.label)!;
    const startingCallCount = mocks.authRequest.mock.calls.length;
    await changeBitrate(input, "500");
    expect(input.value).toBe(String(setting.initial));
    expect(mocks.authRequest).toHaveBeenCalledTimes(startingCallCount);

    await changeBitrate(input, "20500");
    expect(input.value).toBe(String(setting.initial));
    expect(mocks.authRequest).toHaveBeenCalledTimes(startingCallCount);
  });

  it("shows matching quality controls for group calls, voice chats, and DM calls", async () => {
    await renderPage();
    for (const sectionName of ["Group calls & voice chats", "DM calls"]) {
      const heading = [...document.querySelectorAll("h2")].find((candidate) => candidate.textContent?.trim() === sectionName);
      expect(heading, `missing ${sectionName} section`).toBeTruthy();
      const section = heading?.closest("section");
      expect(section?.querySelector('input[aria-label="Screen-share bitrate (kbps)"]')).toBeNull();
      expect(section?.querySelector('input[aria-label="Camera bitrate (kbps)"]')).toBeTruthy();
    }
  });

  it("shows safety placeholders as disabled and does not save when they are activated", async () => {
    await renderPage();
    const heading = [...document.querySelectorAll("h2")].find((candidate) => candidate.textContent?.trim() === "Safety & moderation");
    expect(heading).toBeTruthy();
    const section = heading?.closest("section");
    for (const label of ["Disallowed file types", "Content safety checks", "Antispam"]) {
      expect(section?.textContent).toContain(label);
      const row = [...(section?.querySelectorAll<HTMLElement>(".appearance-setting-row") ?? [])]
        .find((candidate) => candidate.textContent?.includes(label));
      expect(row?.querySelector(".premium-feature-badge")?.textContent).toBe("Premium");
    }
    const interactiveItems = [...(section?.querySelectorAll<HTMLButtonElement | HTMLInputElement>("button, input, select") ?? [])];
    for (const control of interactiveItems) {
      expect(control.disabled).toBe(true);
      await act(async () => { control.click(); });
    }
    expect(mocks.authRequest).toHaveBeenCalledTimes(1);
    expect(mocks.updateNotificationProviderSettings).not.toHaveBeenCalled();
  });

  it("shows premium retention and compression defaults as locked controls", async () => {
    await renderPage();
    const compression = document.querySelector<HTMLButtonElement>('button[aria-label^="File compression"]')!;
    const messageTtl = document.querySelector<HTMLButtonElement>('button[aria-label^="Message retention"]')!;
    const inactiveUsers = document.querySelector<HTMLButtonElement>('button[aria-label^="Inactive user deletion"]')!;
    expect(compression.textContent).toContain("Optimize size");
    expect(messageTtl.textContent).toContain("Never");
    expect(inactiveUsers.textContent).toContain("Never");
    expect(compression.closest(".server-settings-select")).toBeTruthy();
    expect(messageTtl.closest(".server-settings-select")).toBeTruthy();
    expect(inactiveUsers.closest(".server-settings-select")).toBeTruthy();
    expect(compression.disabled && messageTtl.disabled && inactiveUsers.disabled).toBe(true);
    expect(document.querySelectorAll(".premium-feature-badge")).toHaveLength(6);
    expect(mocks.authRequest).toHaveBeenCalledTimes(1);
    expect(mocks.updateNotificationProviderSettings).not.toHaveBeenCalled();
  });

  it("keeps the premium badge compact within its settings row", () => {
    const badgeRule = globalStyles.match(/\.admin-page \.appearance-setting-row \.premium-feature-badge\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(badgeRule).toMatch(/flex: 0 0 auto;/);
  });

  it("gives every server dropdown a consistent compact width on desktop and mobile", () => {
    const desktopRule = styles.match(/\.admin-page \.appearance-setting-row > \.server-settings-select\s*\{([^}]*)\}/)?.[1] ?? "";
    const mobileRule = styles.match(/@media \(max-width: 600px\)[\s\S]*?\.admin-page \.appearance-setting-row > \.server-settings-select\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(desktopRule).toMatch(/flex: 0 0 240px;/);
    expect(desktopRule).toMatch(/width: 240px;/);
    expect(desktopRule).toMatch(/max-width: 100%;/);
    expect(mobileRule).toMatch(/flex-basis: 180px;/);
    expect(mobileRule).toMatch(/width: 180px;/);
    expect(mobileRule).toMatch(/max-width: 100%;/);
  });

  it("allows manage_server members to update the notification provider", async () => {
    mocks.currentUser = { role: "member", permissions: ["manage_server"] };
    await renderPage();
    const trigger = document.querySelector<HTMLButtonElement>('button[aria-label^="Notification delivery provider"]')!;
    expect(trigger.textContent).toContain("Firebase");
    expect(document.querySelector('input[aria-label="Space Name"]')).toBeNull();
    expect(document.body.textContent).not.toContain("Guest meeting quality");
    expect(document.body.textContent).toContain("Safety & moderation");
    expect(mocks.authRequest).toHaveBeenCalledWith("/api/family");
    await chooseOption("Notification delivery provider", "ntfy");
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
    expect(document.querySelector<HTMLButtonElement>('button[aria-label^="Notification delivery provider"]')?.disabled).toBe(true);
  });
});
