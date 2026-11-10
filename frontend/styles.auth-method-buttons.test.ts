import { expect, it } from "vitest";

import { readCssSource } from "./src/test/cssSource";

it("fully rounds passkey and QR actions across browser and Android login layouts", () => {
  const styles = readCssSource("src/styles.css");

  expect(styles).toMatch(/\.auth-panel \.auth-method-grid \.secondary-button\s*\{[^}]*border-radius:\s*var\(--radius-pill\);/);
  expect(styles).toMatch(/\.android-auth-methods\s*>\s*\.secondary-button\s*\{[^}]*border-radius:\s*var\(--radius-pill\);/);
});
