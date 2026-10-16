import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAppStrings } from "../config/strings";

vi.mock("../i18n/LanguageContext", () => ({
  useStrings: () => getAppStrings("ru"),
  useResolvedLanguage: () => "ru",
}));

import ChatStatsDrawer from "./ChatStatsDrawer";

const roots: Root[] = [];
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
});

describe("ChatStatsDrawer localization", () => {
  it("renders Russian labels for loading and dismiss controls", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    act(() => root.render(<ChatStatsDrawer stats={null} isLoading onClose={vi.fn()} />));

    expect(document.body.querySelector(".chat-stats-eyebrow")?.textContent).toContain("Статистика");
    expect(document.body.querySelector(".chat-stats-state")?.textContent).toBe("Загрузка статистики…");
    expect(document.body.querySelector(".chat-stats-close")?.getAttribute("aria-label")).toBe("Закрыть статистику");
  });
});
