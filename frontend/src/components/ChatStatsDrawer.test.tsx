import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAppStrings } from "../config/strings";

vi.mock("../i18n/LanguageContext", () => ({
  useStrings: () => getAppStrings("ru"),
  useResolvedLanguage: () => "ru",
}));

import ChatStatsDrawer from "./ChatStatsDrawer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ChatStatsDrawer", () => {
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
    document.body.innerHTML = "";
  });

  it("renders Russian labels for loading and dismiss controls", () => {
    act(() => root.render(<ChatStatsDrawer stats={null} isLoading onClose={vi.fn()} />));

    expect(document.body.querySelector(".chat-stats-eyebrow")?.textContent).toContain("Статистика");
    expect(document.body.querySelector(".chat-stats-state")?.textContent).toBe("Загрузка статистики…");
    expect(document.body.querySelector(".popup-close")?.getAttribute("aria-label")).toBe("Закрыть статистику");
  });

  it("closes exactly once when Escape is pressed", () => {
    const onClose = vi.fn();
    act(() => root.render(<ChatStatsDrawer stats={null} isLoading onClose={onClose} />));

    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
