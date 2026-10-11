import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SharedCallStage } from "./SharedCallStage";

const roots: Root[] = [];
afterEach(() => {
  while (roots.length) act(() => roots.pop()?.unmount());
  document.body.innerHTML = "";
});

describe("SharedCallStage", () => {
  it("provides a shared accessible participant rail toggle without replacing its stage children", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    const onToggleParticipants = vi.fn();
    act(() => root.render(
      <SharedCallStage isSharing onToggleParticipants={onToggleParticipants}>
        <div className="call-grid__participant-rail">participant rail</div>
        <div data-testid="presenter">presentation</div>
        <audio data-testid="remote-audio" />
      </SharedCallStage>,
    ));

    const toggle = host.querySelector<HTMLButtonElement>("button.shared-call-participants-toggle");
    expect(toggle).toBeTruthy();
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelector("[data-testid='presenter']")?.textContent).toBe("presentation");
    expect(host.querySelector("[data-testid='remote-audio']")).toBeTruthy();
    act(() => toggle?.click());
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(onToggleParticipants).toHaveBeenCalledWith(true);
    expect(host.querySelector("[data-testid='remote-audio']")).toBeTruthy();
  });

  it("does not show a participant toggle when the call is not sharing", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    act(() => root.render(<SharedCallStage isSharing={false}><span>gallery</span></SharedCallStage>));
    expect(host.querySelector("button.shared-call-participants-toggle")).toBeNull();
  });
  it("restores the participant rail after sharing ends before the next call", () => {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host); roots.push(root);
    const render = (isSharing: boolean) => act(() => root.render(<SharedCallStage isSharing={isSharing}><div>stage</div></SharedCallStage>));
    render(true);
    act(() => host.querySelector<HTMLButtonElement>(".shared-call-participants-toggle")?.click());
    expect(host.querySelector(".shared-call-participants-toggle")?.getAttribute("aria-expanded")).toBe("false");
    render(false);
    render(true);
    expect(host.querySelector(".shared-call-participants-toggle")?.getAttribute("aria-expanded")).toBe("true");
  });
});
