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
    expect(container.textContent).not.toContain("Эти настройки не выдают доступ");
    expect(container.textContent).not.toContain("Доступ Insight выдаётся только в его авторизованном окне согласия");
    expect(container.querySelector(".mcp-insight-permissions .mcp-select-all-button")?.textContent).toBe("Выбрать все");
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
    expect(container.querySelectorAll(".mcp-provider-tab")).toHaveLength(4);
    expect(container.querySelectorAll(".mcp-provider-mark")).toHaveLength(4);
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
    expect(container.textContent).not.toContain("авторизованном окне согласия");

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".mcp-insight-permissions .mcp-select-all-button")?.click();
    });
    expect(Array.from(container.querySelectorAll<HTMLInputElement>(".mcp-insight-permissions input[type='checkbox']")).every((input) => input.checked)).toBe(true);
    await act(async () => {
      container.querySelectorAll<HTMLButtonElement>(".mcp-select-all-button")[1]?.click();
    });
    const messengerPermissions = container.querySelectorAll(".mcp-tag-fieldset:not(.mcp-insight-permissions)")[1];
    expect(Array.from(messengerPermissions?.querySelectorAll<HTMLInputElement>("input[type='checkbox']") ?? []).every((input) => input.checked)).toBe(true);

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
      token: "private-token", mcpUrl: "https://messenger.example/mcp",
      setupPrompt: "Connect to stovo-messenger over Streamable HTTP. Set Authorization: Bearer <token> as an HTTP header; do not add env or configure an unrelated MCP server. To test the connection, call stovo_connection_status. Do not list chats or send messages.",
      cliCommand: "codex mcp add stovo-messenger", claudeCommand: "codex mcp add stovo-messenger",
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
    const codexProvider = Array.from(container.querySelectorAll<HTMLButtonElement>(".mcp-provider-tab"))
      .find((button) => button.textContent?.includes("ChatGPT (Codex)"));
    const chatChoice = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='checkbox']"))
      .find((input) => input.parentElement?.textContent?.includes("Project room"));
    const insightReadChoice = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='checkbox']"))
      .find((input) => input.parentElement?.textContent?.includes("Читать историю чата"));

    await act(async () => {
      if (nicknameInput) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(nicknameInput, "Researcher");
        nicknameInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
      codexProvider?.click();
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
    expect(container.textContent).not.toContain("ШАГ 1 ИЗ 3");
    expect(container.textContent).not.toContain("ШАГ 2 ИЗ 3");
    expect(container.textContent).not.toContain("ШАГ 3 ИЗ 3");
    expect(container.textContent).toContain("stovo-messenger");
    expect(container.textContent).toContain("Streamable HTTP");
    expect(container.textContent).toContain("не добавляйте env");
    expect(container.textContent).not.toContain("подтвердите каждое разрешение в авторизованном окне согласия Stovo Insight");
    expect(container.querySelectorAll(".mcp-setup-prompt")).toHaveLength(1);
    expect(container.querySelector(".mcp-local-codex-prompt")).toBeNull();
    const promptValue = container.querySelector<HTMLTextAreaElement>(".mcp-setup-prompt")?.value ?? "";
    expect(promptValue).toContain("To test the connection, call stovo_connection_status");
    expect(promptValue).toContain("Читать историю чата");
    expect(promptValue).toContain("pair_local_codex(connection_id, chat_id)");
    expect(promptValue).toContain("stop for my confirmation");
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector(".mcp-connector-list")).toBeNull();
    expect(document.activeElement).toBe(container.querySelector(".mcp-secret-header h2"));

    const doneButton = Array.from(container.querySelectorAll<HTMLButtonElement>(".public-access-actions button"))
      .find((button) => button.textContent?.trim() === "Готово");
    expect(doneButton).toBeTruthy();
    expect(container.textContent).not.toContain("вернуться к агентам");
  });
});
