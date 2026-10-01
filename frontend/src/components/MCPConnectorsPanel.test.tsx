import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../i18n/LanguageContext", async () => {
  const { getAppStrings } = await import("../config/strings");
  return { useStrings: () => getAppStrings("ru") };
});
vi.mock("../api/mcpConnectors", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/mcpConnectors")>();
  return { ...actual, listMCPConnectors: vi.fn().mockResolvedValue([]) };
});

import MCPConnectorsPanel from "./MCPConnectorsPanel";

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

    expect(container.textContent).toContain("Подключить Stovo к агенту");
    expect(container.textContent).toContain("Создать подключение агента");
    expect(container.textContent).toContain("Доступ к чатам в этом Space");
    expect(container.textContent).toContain("Права (изначально выключены)");
    expect(container.textContent).toContain("Просматривать список чатов");
    expect(container.textContent).toContain("Существующие подключения");
    expect(container.textContent).toContain("Пока нет подключений.");
    expect(container.textContent).not.toContain("Create agent connection");
    expect(container.textContent).not.toContain("Existing connections");
  });
});
