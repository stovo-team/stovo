import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authRequest: vi.fn(),
  currentUser: { role: "owner", permissions: ["manage_server", "manage_integrations"] as string[] },
  loadIntelligenceConnections: vi.fn(),
  revokeIntelligenceConnection: vi.fn(),
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ accessToken: "test-token", authRequest: mocks.authRequest, currentUser: mocks.currentUser })
}));
vi.mock("./AppNav", () => ({ default: () => null }));
vi.mock("../api/intelligence", () => ({
  loadIntelligenceConnections: (...args: unknown[]) => mocks.loadIntelligenceConnections(...args),
  revokeIntelligenceConnection: (...args: unknown[]) => mocks.revokeIntelligenceConnection(...args),
}));
vi.mock("../i18n/LanguageContext", async () => {
  const { getAppStrings } = await import("../config/strings");
  return { useStrings: () => getAppStrings("ru") };
});

import AdminInsightPage from "./AdminInsightPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("AdminInsightPage", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    mocks.currentUser = { role: "owner", permissions: ["manage_server", "manage_integrations"] };
    mocks.authRequest.mockImplementation(async (endpoint: string) => {
      if (endpoint === "/api/family") return { id: "fam-1", name: "Команда Stovo" };
      return {};
    });
    mocks.loadIntelligenceConnections.mockResolvedValue({ connections: [] });
    mocks.revokeIntelligenceConnection.mockResolvedValue({ revoked: true });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
    vi.clearAllMocks();
  });

  async function renderPage() {
    await act(async () => {
      root?.render(<MemoryRouter><AdminInsightPage /></MemoryRouter>);
    });
  }

  it("renders clean header without subtitle paragraph", async () => {
    mocks.loadIntelligenceConnections.mockResolvedValueOnce({ connections: [] });
    await renderPage();

    const header = container?.querySelector(".admin-detail-header");
    expect(header?.querySelector("p")).toBeNull();
  });

  it("renders not connected state when no active space connection exists", async () => {
    mocks.loadIntelligenceConnections.mockResolvedValueOnce({ connections: [] });
    await renderPage();

    expect(container?.textContent).toContain("Stovo Insight");
    expect(container?.textContent).toContain("Подключение базы знаний");
    expect(container?.textContent).toContain("Согласие Source v2");
    expect(container?.textContent).toContain("Не подключено");
    expect(container?.textContent).toContain("Синхронизация сообщений");
    expect(container?.textContent).toContain("Отключена");
    expect(container?.querySelector(".insight-connect-button")?.textContent).toBe("Подключить Space");
  });

  it("renders connected state and disconnect button when active space connection exists", async () => {
    mocks.loadIntelligenceConnections.mockResolvedValueOnce({
      connections: [{
        id: "conn-123",
        scope_kind: "space",
        chat_title: "All chats",
        grants: { read: true, process: true, external_transfer: false, export: false, codex: true, reply: true },
        created_at: "2026-11-20T10:00:00Z",
        expires_at: "2026-12-20T10:00:00Z",
        revoked_at: null,
      }]
    });

    await renderPage();

    expect(container?.textContent).toContain("Подключено");
    expect(container?.textContent).toContain("Активна (фоновая синхронизация)");
    expect(container?.textContent).toContain("Все доступные чаты Space");
    expect(container?.querySelector(".danger-button")?.textContent).toBe("Отключить Space");
  });

  it("handles disconnect space action", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.loadIntelligenceConnections
      .mockResolvedValueOnce({
        connections: [{
          id: "conn-123",
          scope_kind: "space",
          chat_title: "All chats",
          grants: { read: true, process: true, external_transfer: false, export: false, codex: true, reply: true },
          created_at: "2026-11-20T10:00:00Z",
          expires_at: "2026-12-20T10:00:00Z",
          revoked_at: null,
        }]
      })
      .mockResolvedValueOnce({ connections: [] });

    await renderPage();

    const disconnectBtn = container?.querySelector<HTMLButtonElement>(".danger-button");
    expect(disconnectBtn).toBeTruthy();

    await act(async () => {
      disconnectBtn?.click();
    });

    expect(mocks.revokeIntelligenceConnection).toHaveBeenCalledWith(
      expect.anything(),
      "conn-123",
      "connection"
    );
  });
});
