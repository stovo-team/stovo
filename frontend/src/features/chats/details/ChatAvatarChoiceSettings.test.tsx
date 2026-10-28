import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { Chat } from "../../../api/chats";
import { ChatAvatarChoiceSettings } from "./ChatAvatarChoiceSettings";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("switches from a chat photo to the chosen colored symbol", () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const onChange = vi.fn();
  const chat = { id: "group", type: "group", avatarMode: "photo", chatPhoto: { id: "photo" } } as Chat;
  act(() => root.render(<ChatAvatarChoiceSettings chat={chat} label="Group" accessToken={null} onChange={onChange} />));
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Blue"]')!.click());
  expect(onChange).toHaveBeenCalledWith({ avatarMode: "symbol", avatarColorId: "blue" });
  act(() => root.unmount());
});
