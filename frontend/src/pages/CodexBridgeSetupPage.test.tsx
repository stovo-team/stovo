import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import CodexBridgeSetupPage from "./CodexBridgeSetupPage";
import { englishStrings } from "../config/strings";

vi.mock("../i18n/LanguageContext", () => ({ useStrings: () => englishStrings }));

const roots: Root[] = [];
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  while (roots.length > 0) act(() => roots.pop()?.unmount());
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function renderPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<CodexBridgeSetupPage />));
  return container;
}

describe("CodexBridgeSetupPage", () => {
  it("offers a copyable prompt with explicit manual pairing and safety boundaries", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const page = renderPage();
    const prompt = page.querySelector<HTMLTextAreaElement>("textarea");

    expect(prompt?.value).toContain("pair_local_codex(connection_id, chat_id)");
    expect(prompt?.value).toContain("never into this chat");
    expect(prompt?.value).toContain("Do not use sudo or edit the system policy automatically");
    expect(page.textContent).toContain(englishStrings.codexBridgeSetup.limits);
    expect(page.textContent).toContain(englishStrings.codexBridgeSetup.failure);

    await act(async () => page.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(writeText).toHaveBeenCalledWith(prompt?.value);
    expect(page.textContent).toContain(englishStrings.codexBridgeSetup.copied);
  });

  it("keeps the prompt available when clipboard access fails", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    const page = renderPage();
    await act(async () => page.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(page.querySelector("textarea")?.value.length).toBeGreaterThan(500);
    expect(page.textContent).toContain(englishStrings.codexBridgeSetup.copyError);
  });
});
