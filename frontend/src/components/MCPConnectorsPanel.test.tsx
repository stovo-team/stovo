import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../i18n/LanguageContext", async () => {
  const { getAppStrings } = await import("../config/strings");
  return { useStrings: () => getAppStrings("ru") };
});
vi.mock("../api/mcpConnectors", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/mcpConnectors")>();
  return {
    ...actual,
    listMCPConnectors: vi.fn().mockResolvedValue([]),
    createMCPConnector: vi.fn(),
  };
});

import MCPConnectorsPanel from "./MCPConnectorsPanel";
import { createMCPConnector } from "../api/mcpConnectors";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("MCPConnectorsPanel Russian localization", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("translates connection setup, scopes, permissions, and empty states", async () => {
    await act(async () => {
      root.render(<MCPConnectorsPanel
        accessToken="test-token"
        authRequest={async <T,>() => [] as T}
        spaceName="Дом"
        onError={vi.fn()}
        onNotice={vi.fn()}
      />);
    });

    expect(container.textContent).toContain("Создать подключение агента");
    expect(container.textContent).toContain("Доступ к чатам в этом Space");
    expect(container.textContent).toContain("Разрешения Stovo Insight");
    expect(container.textContent).toContain("Эти настройки не выдают доступ");
    expect(container.textContent).toContain("Права (изначально выключены)");
    expect(container.textContent).toContain("Просматривать список чатов");
    expect(container.textContent).toContain("Существующие подключения");
    expect(container.textContent).toContain("Пока нет подключений.");
    expect(container.textContent).not.toContain("Create agent connection");
    expect(container.textContent).not.toContain("Existing connections");
    expect(container.querySelector(".mcp-local-codex-prompt")).toBeNull();
  });

  it("shows an explicit agent identity and least-privilege Messenger and Insight choices", async () => {
    await act(async () => {
      root.render(<MCPConnectorsPanel
        accessToken="test-token"
        authRequest={async <T,>(endpoint: string) => (endpoint === "/api/chats" ? [{
          id: "chat-one", title: "Project room", type: "channel", members: [],
        }] : []) as T}
        spaceName="Дом"
        onError={vi.fn()}
        onNotice={vi.fn()}
      />);
    });

    expect(container.textContent).toContain("Псевдоним агента");
    expect(container.querySelector("select[aria-label='Провайдер агента']")).toBeTruthy();
    expect(container.textContent).toContain("Разрешения Stovo Insight");

    const chatChoice = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='checkbox']"))
      .find((input) => input.parentElement?.textContent?.includes("Project room"));
    const readHistoryChoice = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='checkbox']"))
      .find((input) => input.parentElement?.textContent?.includes("Читать историю"));
    const insightReadChoice = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='checkbox']"))
      .find((input) => input.parentElement?.textContent?.includes("Читать историю чата"));

    expect(chatChoice?.checked).toBe(false);
    expect(readHistoryChoice?.checked).toBe(false);
    expect(insightReadChoice?.checked).toBe(false);
    expect(container.textContent).toContain("Доступ Insight выдаётся только в его авторизованном окне согласия");

    const nicknameInput = Array.from(container.querySelectorAll<HTMLInputElement>("input"))
      .find((input) => input.closest("label")?.textContent?.includes("Псевдоним агента"));
    expect(nicknameInput).toBeTruthy();
    await act(async () => {
      if (!nicknameInput) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(nicknameInput, "Researcher");
      nicknameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).toContain("@researcher");
  });

  it("submits selected Messenger scope and opens onboarding with Insight preferences", async () => {
    vi.mocked(createMCPConnector).mockResolvedValueOnce({
      connector: {
        id: "connector-one", name: "Researcher", actorUserId: "agent-user", enabled: true, revoked: false,
        createdBy: "owner", createdAt: "2026-11-18T00:00:00Z", lastUsedAt: null, maxHistoryMessages: 50,
        permissions: { "chats.list": false, "messages.read": false, "messages.search": false, "messages.send": false, "messages.edit": false, "messages.delete": false, "messages.react": false, "messages.forward": false, "messages.pin": false, "messages.unpin": false, "files.list": false, "files.download": false },
        provider: "codex", alias: "researcher", authMode: "subscription", allowedChatIds: ["chat-one"],
      },
      token: "private-token", mcpUrl: "https://messenger.example/mcp", setupPrompt: "Use this secure MCP connection.",
      cliCommand: "codex mcp add stovo", claudeCommand: "codex mcp add stovo",
    });

    await act(async () => {
      root.render(<MCPConnectorsPanel
        accessToken="test-token"
        authRequest={async <T,>(endpoint: string) => (endpoint === "/api/chats" ? [{
          id: "chat-one", title: "Project room", type: "channel", members: [],
        }] : []) as T}
        spaceName="Дом"
        onError={vi.fn()}
        onNotice={vi.fn()}
      />);
    });

    const nicknameInput = Array.from(container.querySelectorAll<HTMLInputElement>("input"))
      .find((input) => input.closest("label")?.textContent?.includes("Псевдоним агента"));
    const providerSelect = container.querySelector<HTMLSelectElement>("select[aria-label='Провайдер агента']");
    const chatChoice = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='checkbox']"))
      .find((input) => input.parentElement?.textContent?.includes("Project room"));
    const insightReadChoice = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='checkbox']"))
      .find((input) => input.parentElement?.textContent?.includes("Читать историю чата"));

    await act(async () => {
      if (nicknameInput) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(nicknameInput, "Researcher");
        nicknameInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
      if (providerSelect) {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(providerSelect, "codex");
        providerSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
      chatChoice?.click();
      insightReadChoice?.click();
    });

    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(createMCPConnector).toHaveBeenCalledWith("test-token", expect.objectContaining({
      name: "Researcher", provider: "codex", alias: "researcher", allowedChatIds: ["chat-one"],
      permissions: expect.objectContaining({ "messages.read": false, "chats.list": false }),
    }));
    expect(createMCPConnector).not.toHaveBeenCalledWith("test-token", expect.objectContaining({ insightGrants: expect.anything() }));
    expect(container.textContent).toContain("ШАГ 1 ИЗ 3");
    expect(container.textContent).toContain("ШАГ 2 ИЗ 3");
    expect(container.textContent).toContain("ШАГ 3 ИЗ 3");
    expect(container.textContent).toContain("Читать историю чата");
    expect(container.textContent).toContain("macOS или Linux, Node.js 22+");
    expect(container.textContent).toContain("подтвердите каждое разрешение в авторизованном окне согласия Stovo Insight");
    expect(container.querySelector(".mcp-local-codex-prompt textarea")?.value).toContain("pair_local_codex(connection_id, chat_id)");
    expect(container.querySelector(".mcp-local-codex-prompt textarea")?.value).toContain("stop for my confirmation");
    expect(container.querySelector(".mcp-local-codex-prompt button")?.getAttribute("aria-label")).toBe("Скопировать запрос настройки");
    expect(container.querySelector(".mcp-local-codex-panel details")).toBeTruthy();
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector(".mcp-connector-list")).toBeNull();
    expect(document.activeElement).toBe(container.querySelector(".mcp-secret-header h2"));
  });
});
