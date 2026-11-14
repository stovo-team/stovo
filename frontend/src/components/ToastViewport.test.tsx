import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("../i18n/LanguageContext", () => ({ useStrings: () => ({ accessibility: { dismissNotification: "Dismiss notification" } }) }));
import { showToast, ToastViewport } from "./ToastViewport";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let host: HTMLDivElement;

afterEach(() => {
  if (root) act(() => root?.unmount());
  host?.remove();
});

it("announces distinct success and error toasts with an accessible dismiss control", () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(<ToastViewport />));
  act(() => {
    showToast("Saved", "success");
    showToast("Could not save", "error");
  });

  expect(host.querySelector('[role="status"]')?.textContent).toContain("Saved");
  expect(host.querySelector('[role="alert"][aria-live="assertive"]')?.textContent).toContain("Could not save");
  expect(host.querySelectorAll('[aria-label="Dismiss notification"]')).toHaveLength(2);
});
