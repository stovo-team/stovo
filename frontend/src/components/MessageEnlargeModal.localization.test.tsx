import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAppStrings } from "../config/strings";

vi.mock("../i18n/LanguageContext", () => ({ useStrings: () => getAppStrings("ru") }));

import { MessageEnlargeButton, MessageEnlargeModal } from "./MessageEnlargeModal";

const roots: Root[] = [];
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
});

describe("expanded composer localization", () => {
  it("renders Russian formatting labels, placeholder, and expand controls", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    act(() => root.render(
      <>
        <MessageEnlargeModal content="" renderMarkdown={false} editable onClose={vi.fn()} />
        <MessageEnlargeButton onClick={vi.fn()} />
      </>
    ));

    expect(document.body.querySelector('[aria-label="Написать сообщение"]')).not.toBeNull();
    expect(document.body.querySelector('[title="Жирный (**текст**)"]')).not.toBeNull();
    expect(document.body.querySelector<HTMLTextAreaElement>(".message-enlarge-editor")?.placeholder).toBe("Введите сообщение…");
    expect(document.body.querySelector('[aria-label="Развернуть редактор сообщения"]')).not.toBeNull();
  });
});
