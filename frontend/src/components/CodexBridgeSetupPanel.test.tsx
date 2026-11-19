import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import CodexBridgeSetupPanel, { CodexBridgeSetupPrompt } from "./CodexBridgeSetupPanel";
import { englishStrings, russianStrings } from "../config/strings";

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
  act(() => root.render(<><CodexBridgeSetupPrompt /><CodexBridgeSetupPanel /></>));
  return container;
}

describe("CodexBridgeSetupPanel", () => {
  it("styles the setup text as a readable UI-font prompt in a black box", async () => {
    const { readTextFile } = await import("../testUtils/readTextFile");
    const css = readTextFile("src/components/CodexBridgeSetupPanel.css");
    expect(css).toMatch(/\.mcp-local-codex-panel\s*\{[^}]*background:\s*var\(--color-palette-7b2817bf9b80\)/);
    expect(css).toMatch(/\.mcp-local-codex-panel\s*\{[^}]*padding:\s*18px/);
    expect(css).toMatch(/\.mcp-local-codex-prompt\s*\{[^}]*background:\s*var\(--color-palette-7b2817bf9b80\)/);
    expect(css).toMatch(/\.mcp-local-codex-prompt\s*\{[^}]*border-radius:\s*var\(--radius-panel\)/);
    expect(css).toMatch(/\.mcp-local-codex-prompt \.mcp-setup-prompt\s*\{[^}]*font-family:\s*var\(--font-family-ui\)/);
    expect(css).toMatch(/\.mcp-local-codex-prompt \.mcp-setup-prompt\s*\{[^}]*background:\s*var\(--color-palette-7b2817bf9b80\)/);
    expect(css).toMatch(/\.mcp-local-codex-prompt \.mcp-setup-prompt\s*\{[^}]*border-radius:\s*var\(--radius-control\)/);
  });

  it("offers a copyable prompt with explicit manual pairing and safety boundaries", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const page = renderPage();
    const prompt = page.querySelector<HTMLTextAreaElement>("textarea");

    expect(prompt?.value).toContain("pair_local_codex(connection_id, chat_id)");
    expect(prompt?.value).toContain("read, process, codex, and reply grants");
    expect(prompt?.value).toContain("does not have external_transfer or export");
    expect(prompt?.value).toContain("never into this chat");
    expect(prompt?.value).toContain("Do not use sudo or edit the system policy automatically");
    expect(page.querySelector(".mcp-local-codex-prompt")?.nextElementSibling?.classList.contains("mcp-local-codex-panel")).toBe(true);
    expect(page.querySelector("button")?.textContent?.trim()).toBe("");
    expect(page.querySelector("button")?.getAttribute("aria-label")).toBe(englishStrings.codexBridgeSetup.copy);
    expect(page.textContent).toContain(englishStrings.codexBridgeSetup.limits);
    expect(page.textContent).toContain(englishStrings.codexBridgeSetup.failure);
    expect(englishStrings.codexBridgeSetup.safety).toContain("Read-only turns do not trigger approval checkpoints");
    expect(russianStrings.codexBridgeSetup.safety).toContain("Для операций только на чтение этап подтверждения не запускается");

    await act(async () => page.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(writeText).toHaveBeenCalledWith(prompt?.value);
    expect(page.querySelector("button")?.getAttribute("aria-label")).toBe(englishStrings.codexBridgeSetup.copied);
  });

  it("keeps the prompt available when clipboard access fails", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    const page = renderPage();
    await act(async () => page.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(page.querySelector("textarea")?.value.length).toBeGreaterThan(500);
    expect(page.textContent).toContain(englishStrings.codexBridgeSetup.copyError);
  });
});
