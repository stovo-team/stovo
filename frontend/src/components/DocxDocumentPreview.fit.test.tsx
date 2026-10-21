import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { getAppStrings } from "../config/strings";
vi.mock("../i18n/LanguageContext", () => ({ useStrings: () => getAppStrings("en") }));
vi.mock("docx-preview", () => ({ renderAsync: vi.fn(async (_blob, host, _style, options) => {
  const wrapper = document.createElement("div"); wrapper.className = `${options.className}-wrapper`;
  const page = document.createElement("section"); page.className = options.className;
  Object.defineProperties(page, { offsetWidth: { value: 816 }, offsetHeight: { value: 1056 } });
  wrapper.append(page); host.append(wrapper);
}) }));
import { DocxDocumentPreview } from "./DocxDocumentPreview";

it("fits pages using the renderer's configured class names", async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(408);
  try {
    await act(async () => { root.render(<DocxDocumentPreview blob={new Blob(["docx"])} fitToWidth />); });
    const page = host.querySelector<HTMLElement>("section")!;
    expect(page.style.transform).toBe("scale(0.5)");
    expect(page.parentElement?.style.height).toBe("528px");
  } finally { await act(async () => root.unmount()); host.remove(); width.mockRestore(); }
});
