import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { SymbolColorControls } from "./SymbolColorControls";
import { readCssSource } from "../test/cssSource";
import { resolve } from "node:path";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("expands two initial symbol rows and accepts a custom color", () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const onColorChange = vi.fn();
  const symbols = Array.from({ length: 24 }, (_, i) => ({ id: String(i), label: `Symbol ${i}`, icon: <span>{i}</span> }));
  act(() => root.render(<SymbolColorControls symbols={symbols} symbol="0" onSymbolChange={vi.fn()} colors={[{ id: "red", label: "Red", value: "red" }]} color="red" onColorChange={onColorChange} />));
  expect(host.querySelectorAll('.symbol-color-controls__icons button')).toHaveLength(12);
  act(() => host.querySelector<HTMLButtonElement>('button[aria-expanded]')?.click());
  expect(host.querySelectorAll('.symbol-color-controls__icons button')).toHaveLength(24);
  const input = host.querySelector<HTMLInputElement>('input[type="color"]')!;
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "#786a91"); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(onColorChange).toHaveBeenCalledWith("#786a91");
  act(() => root.unmount());
});

it("keeps symbol picker arrows neutral and selected icons circular without tinting the symbol", () => {
  const styles = readCssSource(resolve(process.cwd(), "src/styles.css"));
  expect(styles).toMatch(/\.symbol-color-controls \.symbol-color-controls__expand:hover[^{}]*\{[^}]*background:\s*transparent/);
  expect(styles).toMatch(/\.symbol-color-controls \.symbol-color-controls__icons button\[aria-pressed="true"\][^{}]*\{[^}]*border-radius:\s*var\(--radius-circle\)/);
  expect(styles).toMatch(/\.symbol-color-controls__icons \.entity-avatar__symbol[^{}]*\{[^}]*color:\s*var\(--text-secondary\)/);
});

it("keeps icon hit areas square and avatar previews plain, including on hover", () => {
  const styles = readCssSource(resolve(process.cwd(), "src/styles.css"));
  expect(styles).toMatch(/\.symbol-color-controls \.symbol-color-controls__icons button\s*\{[^}]*width:\s*40px/);
  expect(styles).toMatch(/\.symbol-color-controls \.symbol-color-controls__expand:hover:not\(:disabled\):not\(\.pinned-banner-click-area\)\s*\{[^}]*background:\s*transparent/);
  expect(styles).toMatch(/\.symbol-color-controls \.entity-avatar\s*\{[^}]*background:\s*transparent/);
});
