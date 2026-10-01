import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authRequest: vi.fn() }));

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ accessToken: "test-token", authRequest: mocks.authRequest, currentUser: { role: "owner" } }) }));
vi.mock("./AppNav", () => ({ default: () => null }));
vi.mock("../components/BackButton", () => ({ BackButton: () => null }));
vi.mock("../i18n/LanguageContext", async () => {
  const { getAppStrings } = await import("../config/strings");
  return { useStrings: () => getAppStrings("ru") };
});

import AdminPluginsPage from "./AdminPluginsPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("AdminPluginsPage Russian localization", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.authRequest.mockResolvedValue([
      { id: "plugin-rich-stats", name: "Rich statistics", enabled: true },
      { id: "plugin-canvas", name: "Canvas", enabled: false },
    ]);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("localizes plugin store names, descriptions, state, and toggle labels", async () => {
    await act(async () => { root.render(<AdminPluginsPage />); });

    expect(container.querySelector("h1")?.textContent).toBe("Магазин плагинов");
    expect(container.textContent).toContain("Интеллект Stovo");
    expect(container.textContent).toContain("Общий холст");
    expect(container.textContent).toContain("Аналитика");
    expect(container.textContent).toContain("Включён");
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Включить: Интеллект Stovo"]')).toBeTruthy();
    expect(container.textContent).not.toContain("Plugin store");
    expect(container.textContent).not.toContain("Rich statistics");
  });
});
