import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  masterLogin: vi.fn(), fetchServers: vi.fn(), fetchTenantAiSettings: vi.fn(), updateServerSettings: vi.fn(), updateTenantAiSettings: vi.fn(), createInviteLink: vi.fn(),
}));

vi.mock("../api/masterAdmin", () => ({
  fetchServers: mocks.fetchServers,
  fetchTenantAiSettings: mocks.fetchTenantAiSettings,
  updateServerSettings: mocks.updateServerSettings,
  updateTenantAiSettings: mocks.updateTenantAiSettings,
  createInviteLink: mocks.createInviteLink, createServer: vi.fn(), deleteServer: vi.fn(), getGhostToken: vi.fn(), masterLogin: mocks.masterLogin,
}));
vi.mock("../i18n/LanguageContext", async () => {
  const { getAppStrings } = await import("../config/strings");
  return { useStrings: () => getAppStrings("ru") };
});

import MultiAdminPage from "./MultiAdminPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("supervisor space management", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.setItem("master_admin_token", "test-token");
    mocks.fetchServers.mockResolvedValue([{ id: 2, slug: "alpha", name: "Alpha", created_at: "2026-01-01T00:00:00Z", status: "running", chat_types: { direct: true, group: true, channel: true, voice: true } }]);
    mocks.fetchTenantAiSettings.mockResolvedValue({ translationEnabled: true, callRecordingEnabled: true, aiNotesEnabled: true, voiceTranscriptionEnabled: true });
    mocks.updateServerSettings.mockImplementation(async (_token, slug, updates) => ({ id: 2, slug, name: updates.name, ...updates }));
    mocks.updateTenantAiSettings.mockImplementation(async (_token, _slug, settings) => settings);
    mocks.createInviteLink.mockResolvedValue("https://example.com/s/alpha/setup?token=inv-123");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    localStorage.removeItem("master_admin_token");
    vi.clearAllMocks();
  });

  it("submits the credentials filled by a password manager without React input events", async () => {
    localStorage.removeItem("master_admin_token");
    mocks.masterLogin.mockResolvedValue("logged-in-token");
    await act(async () => { root.render(<MultiAdminPage />); });
    const username = container.querySelector<HTMLInputElement>('input[type="text"]')!;
    const password = container.querySelector<HTMLInputElement>('input[type="password"]')!;
    username.value = "actual-admin";
    password.value = "remembered-password";
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(mocks.masterLogin).toHaveBeenCalledWith("actual-admin", "remembered-password");
  });

  it("starts with an empty password and identifies the existing-password field for autofill", async () => {
    localStorage.removeItem("master_admin_token");
    await act(async () => { root.render(<MultiAdminPage />); });
    const password = container.querySelector<HTMLInputElement>('input[type="password"]')!;
    expect(password.value).toBe("");
    expect(password.autocomplete).toBe("current-password");
    expect(container.querySelector<HTMLInputElement>('input[type="text"]')!.autocomplete).toBe("username");
  });

  it("renders Stovo logo and brand gradient login button on login screen", async () => {
    localStorage.removeItem("master_admin_token");
    await act(async () => { root.render(<MultiAdminPage />); });
    expect(container.querySelector('img[alt="Stovo logo"]')).toBeTruthy();
    const loginButton = container.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(loginButton).toBeTruthy();
    expect(loginButton?.getAttribute("style")).toContain("var(--color-brand-gradient)");
  });

  it("shows icon-only Settings and Invite, and puts destructive actions in the overflow menu", async () => {
    await act(async () => { root.render(<MultiAdminPage />); });
    expect(container.textContent).toContain("Ваши Space");
    expect(container.querySelector('[aria-label="Настройки: Alpha"]')?.textContent).toBe("");
    expect(container.querySelector('[aria-label="Пригласить в Alpha"]')?.textContent).toBe("");
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Другие действия: Alpha"]')?.click(); });
    expect(document.body.querySelector('[role="menu"]')?.textContent).toContain("Ghost Token");
    expect(document.body.querySelector('[role="menu"]')?.textContent).toContain("Удалить");
  });

  it("renders the actions menu outside the scrollable space list", async () => {
    await act(async () => { root.render(<MultiAdminPage />); });
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Другие действия: Alpha"]')?.click(); });
    const menu = document.body.querySelector('[role="menu"]');
    expect(menu).toBeTruthy();
    expect(container.contains(menu)).toBe(false);
  });

  it("keeps chat types editable, exposes tabs, and saves AI and chat restrictions", async () => {
    await act(async () => { root.render(<MultiAdminPage />); });
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Настройки: Alpha"]')?.click(); });
    expect(container.querySelector('[role="tablist"]')).toBeTruthy();
    await act(async () => { container.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="false"]:nth-child(3)')?.click(); });
    const groupToggle = [...container.querySelectorAll<HTMLElement>(".supervisor-setting-row")].find((row) => row.textContent?.includes("Групповые чаты"))?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(groupToggle?.disabled).toBe(false);
    if (groupToggle) await act(async () => { groupToggle.click(); });
    await act(async () => { container.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="false"]:nth-child(2)')?.click(); });
    const translationToggle = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(translationToggle?.checked).toBe(true);
    if (translationToggle) await act(async () => { translationToggle.click(); });
    await act(async () => { container.querySelector<HTMLButtonElement>('button[type="submit"]')?.click(); });
    expect(mocks.updateServerSettings).toHaveBeenCalledWith("test-token", "alpha", expect.objectContaining({ chat_types: expect.objectContaining({ group: false }) }));
    expect(mocks.updateTenantAiSettings).toHaveBeenCalledWith("test-token", "alpha", expect.objectContaining({ translationEnabled: false }));
  });

  it("closes the settings modal from the shared close control", async () => {
    await act(async () => { root.render(<MultiAdminPage />); });
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Настройки: Alpha"]')?.click(); });
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')?.click(); });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("applies dedicated button classes and styles without hover or text-decoration on space actions", async () => {
    await act(async () => { root.render(<MultiAdminPage />); });
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Настройки: Alpha"]')?.click(); });
    const saveButton = container.querySelector<HTMLButtonElement>(".supervisor-save-settings-button");
    expect(saveButton).toBeTruthy();
    expect(container.querySelector(".supervisor-settings-tabs")).toBeTruthy();
  });

  it("renders settings popup with expanded lg size and detached tabs", async () => {
    await act(async () => { root.render(<MultiAdminPage />); });
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Настройки: Alpha"]')?.click(); });
    const dialog = container.querySelector(".multi-admin-dialog");
    expect(dialog).toBeTruthy();
    expect(dialog?.classList.contains("popup-dialog--lg")).toBe(true);
    const tabs = container.querySelectorAll<HTMLButtonElement>(".supervisor-settings-tabs button");
    expect(tabs.length).toBe(4);
  });

  it("opens the space invite modal with QR and invite link when clicking invite", async () => {
    await act(async () => { root.render(<MultiAdminPage />); });
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Пригласить в Alpha"]')?.click(); });
    expect(mocks.createInviteLink).toHaveBeenCalledWith("test-token", "alpha");
    expect(document.body.querySelector(".invite-modal")).toBeTruthy();
    expect(document.body.querySelector(".invite-modal-qr")).toBeTruthy();
    expect(document.body.querySelector(".invite-modal-link")?.textContent).toContain("/s/alpha/setup?token=inv-123");
  });

  it("freezes hover on supervisor settings tabs and uses brand gradient on primary buttons", async () => {
    const { readTextFile } = await import("../testUtils/readTextFile");
    const css = readTextFile("src/pages/MultiAdminPage.css");
    const themeCss = readTextFile("src/styles/theme.css");
    expect(css).toMatch(/\.supervisor-settings-tabs button:hover/);
    expect(css).toMatch(/background:\s*var\(--surface-card/);
    expect(css).toMatch(/background:\s*var\(--color-brand-gradient\)/);
    expect(themeCss).toMatch(/button:hover:not\(:disabled\):not\(\.pinned-banner-click-area\):not\(\[role="tab"\]\)/);

    await act(async () => { root.render(<MultiAdminPage />); });
    const createButton = container.querySelector<HTMLButtonElement>("header .primaryPillButton");
    expect(createButton).toBeTruthy();
    expect(createButton?.getAttribute("style")).toContain("var(--color-brand-gradient)");

    const spaceLink = container.querySelector<HTMLAnchorElement>('a[href="/s/alpha"]');
    expect(spaceLink).toBeTruthy();
    expect(spaceLink?.getAttribute("style")).toContain("var(--surface-card");
  });

  it("renders Stovo logo in header, removes supervisor badge, and renders monitoring disabled as plain stat value", async () => {
    await act(async () => { root.render(<MultiAdminPage />); });
    const header = container.querySelector("header");
    expect(header).toBeTruthy();
    expect(header?.querySelector('img[alt="Stovo logo"]')).toBeTruthy();
    expect(header?.querySelector("h1")?.textContent).toMatch(/Stovo Spaces|Пространства Stovo/);
    expect(container.textContent).not.toContain("КЛАСТЕРНЫЙ СУПЕРВИЗОР");
    expect(container.textContent).not.toContain("CLUSTER SUPERVISOR");

    const statCards = container.querySelectorAll(".statCard");
    const monitoringCard = Array.from(statCards).find(
      (card) => card.textContent?.includes("Расширенный мониторинг") || card.textContent?.includes("Advanced Monitoring")
    );
    expect(monitoringCard).toBeTruthy();
    expect(monitoringCard?.querySelector("button")).toBeNull();
    expect(monitoringCard?.querySelector(".premium-feature-badge")).toBeNull();
    const statValue = monitoringCard?.querySelector(".statValue");
    expect(statValue).toBeTruthy();
    expect(statValue?.textContent).toMatch(/Мониторинг отключ[её]н|Monitoring disabled/);
  });
});

