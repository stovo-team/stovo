import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { requestCallChatReveal, useCallChatReveal } from "./useCallChatReveal";

it("opens a collapsed chat section and scrolls the call chat into view, including repeated restores", () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
  const scroll = vi.fn();
  const original = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = scroll;
  function List() {
    const [collapsed, setCollapsed] = useState(true);
    useCallChatReveal(() => setCollapsed(false));
    return collapsed ? null : <div className="chat-list-item" data-chat-id="call-chat">Call chat</div>;
  }
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  act(() => root.render(<List />));
  act(() => requestCallChatReveal('call-chat'));
  expect(host.textContent).toBe('Call chat'); expect(scroll).toHaveBeenCalledOnce();
  act(() => requestCallChatReveal('call-chat'));
  expect(scroll).toHaveBeenCalledTimes(2);
  act(() => root.unmount()); host.remove(); HTMLElement.prototype.scrollIntoView = original; vi.unstubAllGlobals();
});
