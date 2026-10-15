import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAppStrings } from "./config/strings";

vi.mock("@capacitor/app", () => ({ App: { addListener: vi.fn(async () => ({ remove: vi.fn() })) } }));
vi.mock("./native/appLockPlugin", () => ({
  authenticateAppLock: vi.fn(async () => { throw new Error("native auth failed"); }),
  isAndroidAppLockAvailablePlatform: () => true,
}));
vi.mock("./settings/devicePreferences", () => ({ readDevicePreferences: () => ({ appLockEnabled: true }) }));
vi.mock("./i18n/LanguageContext", () => ({ useStrings: () => getAppStrings("ru") }));

import AppLockGate from "./AppLockGate";

const roots: Root[] = [];
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
});

describe("AppLockGate localization", () => {
  it("shows localized lock state and authentication failures", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);
    await act(async () => {
      root.render(<AppLockGate />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Приложение заблокировано");
    expect(container.querySelector("h1")?.textContent).toBe("Stovo заблокирован");
    expect(container.textContent).toContain("Не удалось разблокировать приложение. Попробуйте ещё раз.");
    expect(container.querySelector("button")?.textContent).toBe("Разблокировать");
  });
});
