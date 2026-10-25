import { readCssSource } from "../test/cssSource";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerRoles: vi.fn(),
  createServerRole: vi.fn(),
  updateServerRole: vi.fn(),
  deleteServerRole: vi.fn(),
}));

vi.mock("../api/family", () => ({
  getServerRoles: mocks.getServerRoles,
  createServerRole: mocks.createServerRole,
  updateServerRole: mocks.updateServerRole,
  deleteServerRole: mocks.deleteServerRole,
}));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ accessToken: "test-token", currentUser: { role: "owner", permissions: [] } }) }));
vi.mock("./AppNav", () => ({ default: () => null }));
vi.mock("../components/BackButton", () => ({ BackButton: () => null }));
vi.mock("../i18n/LanguageContext", async () => {
  const { getAppStrings } = await import("../config/strings");
  return { useStrings: () => getAppStrings("ru") };
});

import AdminRolesPage from "./AdminRolesPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("AdminRolesPage Russian localization and Premium locks", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.getServerRoles.mockResolvedValue([{ id: "default", name: "Участник", description: "Обычная роль", permissions: [], isDefault: true, memberCount: 3 }]);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("translates role controls and locks every Premium checkbox with helper text", async () => {
    await act(async () => { root.render(<AdminRolesPage />); });

    expect(container.querySelector("h1")?.textContent).toBe("Роли");
    expect(container.textContent).toContain("Роль по умолчанию");
    expect(container.textContent).toContain("Создать роль");
    expect(container.textContent).toContain("Название роли");
    expect(container.textContent).toContain("Управление сервером");
    expect(container.textContent).toContain("Ограничения создания чатов");
    expect(container.textContent).toContain("Дополнительные ограничения ролей");

    const premiumGroups = [...container.querySelectorAll<HTMLElement>(".admin-role-premium-group")];
    expect(premiumGroups).toHaveLength(2);
    for (const group of premiumGroups) {
      expect(group.getAttribute("aria-disabled")).toBe("true");
      expect(group.querySelectorAll(".premium-feature-badge")).toHaveLength(1);
      const controls = [...group.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
      expect(controls.length).toBeGreaterThan(1);
      expect(controls.every((control) => control.disabled)).toBe(true);
      expect(group.querySelectorAll("small").length).toBeGreaterThan(controls.length);
    }
  });

  it("styles Premium role controls as muted and non-interactive", () => {
    const css = readCssSource(resolve(process.cwd(), "src/styles.css"));
    const premiumRule = css.match(/\.admin-role-premium-group\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(premiumRule).toMatch(/filter:\s*grayscale\(1\)/);
    expect(premiumRule).toMatch(/opacity:/);
    expect(premiumRule).toMatch(/pointer-events:\s*none/);
  });
});
