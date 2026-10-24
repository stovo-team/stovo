import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAppStrings } from "../../config/strings";

vi.mock("../../i18n/LanguageContext", () => ({ useStrings: () => getAppStrings("ru") }));

import { RichPollCreator } from "./RichPollCreator";

const roots: Root[] = [];
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
});

describe("RichPollCreator localization", () => {
  it("renders Russian poll copy and validation errors", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    act(() => root.render(<RichPollCreator onSubmit={() => undefined} />));

    expect(container.textContent).toContain("Новый опрос");
    expect(container.textContent).toContain("Скрыть участников голосования");
    expect(container.querySelector<HTMLInputElement>("#poll-question-input")?.placeholder).toBe("Задайте вопрос…");
    act(() => (container.querySelector(".poll-submit-btn") as HTMLButtonElement).click());
    expect(container.textContent).toContain("Введите вопрос.");
  });
});
