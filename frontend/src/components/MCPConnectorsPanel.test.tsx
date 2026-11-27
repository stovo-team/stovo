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

import MCPConnectorsPanel, { buildUnifiedSetupPrompt } from "./MCPConnectorsPanel";
import { createMCPConnector } from "../api/mcpConnectors";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("MCPConnectorsPanel Russian localization and setup prompt", () => {
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

  it("translates connection setup, scopes, insight search toggle, and empty states", async () => {
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
    expect(container.textContent).toContain("Псевдоним агента");
    expect(container.textContent).toContain("Доступ к чатам в этом Space");
    expect(container.textContent).toContain("Разрешить поиск в Stovo Insight");
    expect(container.textContent).not.toContain("Разрешения Stovo Insight");
    expect(container.textContent).not.toContain("Права (изначально выключены)");
    expect(container.textContent).toContain("Существующие подключения");
    expect(container.textContent).toContain("Пока нет подключений.");
    expect(container.textContent).not.toContain("Create agent connection");
    expect(container.textContent).not.toContain("Existing connections");
  });

  it("shows agent identity, provider choice, chat scope, and Insight toggle checked by default", async () => {
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
    expect(container.textContent).not.toContain("Провайдер агента");
    expect(container.querySelector(".mcp-provider-choice")).toBeNull();
    expect(container.querySelectorAll(".mcp-provider-tab")).toHaveLength(0);
    expect(container.querySelectorAll(".mcp-provider-mark")).toHaveLength(0);

    const chatChoice = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='checkbox']"))
      .find((input) => input.parentElement?.textContent?.includes("Project room"));
    const insightToggle = Array.from(container.querySelectorAll<HTMLInputElement>(".mcp-toggle-card input[type='checkbox']"))[0];

    expect(chatChoice?.checked).toBe(false);
    expect(insightToggle?.checked).toBe(true);

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

  it("submits selected scope and generates unified setup prompt with stovo-connector and insight commands", async () => {
    vi.mocked(createMCPConnector).mockResolvedValueOnce({
      connector: {
        id: "connector-one", name: "Researcher", actorUserId: "agent-user", enabled: true, revoked: false,
        createdBy: "owner", createdAt: "2026-11-18T00:00:00Z", lastUsedAt: null, maxHistoryMessages: 50,
        permissions: { "chats.list": true, "messages.read": true, "messages.search": true, "messages.send": true, "messages.edit": true, "messages.delete": true, "messages.react": true, "messages.forward": true, "messages.pin": true, "messages.unpin": true, "files.list": true, "files.download": true },
        provider: "codex", alias: "researcher", authMode: "subscription", allowedChatIds: ["chat-one"],
      },
      token: "private-token", mcpUrl: "https://messenger.example/mcp",
      setupPrompt: "Setup prompt", cliCommand: "stovo-connector", claudeCommand: "stovo-connector",
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
    const chatChoice = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='checkbox']"))
      .find((input) => input.parentElement?.textContent?.includes("Project room"));

    await act(async () => {
      if (nicknameInput) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(nicknameInput, "Researcher");
        nicknameInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
      chatChoice?.click();
    });

    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(createMCPConnector).toHaveBeenCalledWith("test-token", expect.objectContaining({
      name: "Researcher", alias: "researcher", allowedChatIds: ["chat-one"],
    }));

    expect(container.querySelectorAll(".mcp-setup-prompt")).toHaveLength(1);
    const promptValue = container.querySelector<HTMLTextAreaElement>(".mcp-setup-prompt")?.value ?? "";
    expect(promptValue).toContain("stovo-connector --agent @researcher");
    expect(promptValue).toContain("codex mcp add insight --url https://messenger.example/api/v2/intelligence/mcp");
    expect(promptValue).toContain("Search Stovo Insight using the insight MCP server");

    expect(container.textContent).toContain("Команда запуска stovo-connector");
    expect(container.textContent).toContain("Команда Insight MCP");

    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector(".mcp-connector-list")).toBeNull();

    const doneButton = Array.from(container.querySelectorAll<HTMLButtonElement>(".public-access-actions button"))
      .find((button) => button.textContent?.trim() === "Готово");
    expect(doneButton).toBeTruthy();
  });

  it("buildUnifiedSetupPrompt includes connector and insight commands", () => {
    const result = buildUnifiedSetupPrompt({
      alias: "support-bot",
      provider: "Codex",
      mcpUrl: "https://example.com/s/demo/mcp",
      token: "secret-abc",
      allowInsightSearch: true,
    });

    expect(result.connectorCommand).toBe("stovo-connector --agent @support-bot --url https://example.com/s/demo/mcp --token secret-abc");
    expect(result.insightCommand).toBe('codex mcp add insight --url https://example.com/s/demo/api/v2/intelligence/mcp --header "Authorization: Bearer secret-abc"');
    expect(result.prompt).toContain(result.connectorCommand);
    expect(result.prompt).toContain(result.insightCommand);
  });
});
