import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { MeetingIntelligencePopover } from "./MeetingIntelligencePopover";

const roots: Root[] = [];
const originalWidth = window.innerWidth;
const originalHeight = window.innerHeight;
const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

afterEach(() => {
  while (roots.length) act(() => roots.pop()?.unmount());
  document.body.innerHTML = "";
  Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: originalHeight });
  HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
});

function renderPopover(anchorRect: DOMRect) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1000 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 700 });
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.classList.contains("meeting-intel-popover")) {
      return { x: 0, y: 0, top: 0, left: 0, right: 336, bottom: 300, width: 336, height: 300, toJSON: () => ({}) } as DOMRect;
    }
    return originalGetBoundingClientRect.call(this);
  };

  const callPopup = document.createElement("div");
  callPopup.className = "call-popup";
  const anchor = document.createElement("div");
  anchor.className = "call-ctrl-wrap";
  anchor.getBoundingClientRect = () => anchorRect;
  callPopup.append(anchor);
  document.body.append(callPopup);

  const root = createRoot(anchor);
  roots.push(root);
  act(() => {
    root.render(
      <MeetingIntelligencePopover
        isOpen
        onClose={() => {}}
        notesState="idle"
        onToggleNotes={() => {}}
        recordingState="idle"
        recordingTimer="00:00"
        onToggleRecording={() => {}}
        isCaptionsEnabled={false}
        onToggleCaptions={() => {}}
        targetLanguage="en"
        onChangeTargetLanguage={() => {}}
      />,
    );
  });

  return document.body.querySelector<HTMLElement>(".meeting-intel-popover");
}

describe("meeting intelligence popover placement", () => {
  it("opens beside its own control and clamps to the right viewport edge", () => {
    const popover = renderPopover({
      x: 960, y: 480, top: 480, right: 1000, bottom: 520, left: 960, width: 40, height: 40,
      toJSON: () => ({}),
    } as DOMRect);

    expect(popover?.parentElement).toBe(document.body);
    expect(popover?.style.position).toBe("fixed");
    expect(Number.parseFloat(popover?.style.left ?? "NaN")).toBe(648);
    expect(Number.parseFloat(popover?.style.top ?? "NaN")).toBe(168);
  });

  it("opens below its control when there is not enough room above", () => {
    const popover = renderPopover({
      x: 400, y: 20, top: 20, right: 450, bottom: 60, left: 400, width: 50, height: 40,
      toJSON: () => ({}),
    } as DOMRect);

    expect(popover?.parentElement).toBe(document.body);
    expect(popover?.style.position).toBe("fixed");
    expect(Number.parseFloat(popover?.style.left ?? "NaN")).toBe(257);
    expect(Number.parseFloat(popover?.style.top ?? "NaN")).toBe(72);
  });
});
