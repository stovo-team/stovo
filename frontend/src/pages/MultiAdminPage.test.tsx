import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchServers: vi.fn(), fetchTenantAiSettings: vi.fn(), updateServerSettings: vi.fn(), updateTenantAiSettings: vi.fn(),
}));

vi.mock("../api/masterAdmin", () => ({
  fetchServers: mocks.fetchServers,
  fetchTenantAiSettings: mocks.fetchTenantAiSettings,
  updateServerSettings: mocks.updateServerSettings,
  updateTenantAiSettings: mocks.updateTenantAiSettings,
  createInviteLink: vi.fn(), createServer: vi.fn(), deleteServer: vi.fn(), getGhostToken: vi.fn(), masterLogin: vi.fn(),
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

  it("shows icon-only Settings and Invite, and puts destructive actions in the overflow menu", async () => {
    await act(async () => { root.render(<MultiAdminPage />); });
    expect(container.textContent).toContain("Ваши Space");
    expect(container.querySelector('[aria-label="Настройки: Alpha"]')?.textContent).toBe("");
    expect(container.querySelector('[aria-label="Пригласить: Alpha"]')?.textContent).toBe("");
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Дополнительные действия: Alpha"]')?.click(); });
    expect(container.querySelector('[role="menu"]')?.textContent).toContain("Ghost Token");
    expect(container.querySelector('[role="menu"]')?.textContent).toContain("Удалить");
  });

  it("keeps chat types editable, exposes tabs, and saves AI and chat restrictions", async () => {
    await act(async () => { root.render(<MultiAdminPage />); });
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Настройки: Alpha"]')?.click(); });
    expect(container.querySelector('[role="tablist"]')).toBeTruthy();
    await act(async () => { container.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="false"]:nth-child(3)')?.click(); });
    const groupToggle = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
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

  it("closes the settings modal from the large close control", async () => {
    await act(async () => { root.render(<MultiAdminPage />); });
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Настройки: Alpha"]')?.click(); });
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Close settings"]')?.click(); });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
