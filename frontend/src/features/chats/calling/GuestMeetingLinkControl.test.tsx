import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Chat } from "../../../api/chats";

const { createGuestMeeting, sendMessage, encryptMessageContent } = vi.hoisted(() => ({
  createGuestMeeting: vi.fn(),
  sendMessage: vi.fn(),
  encryptMessageContent: vi.fn()
}));

vi.mock("../../../api/guestMeetings", () => ({ createGuestMeeting }));
vi.mock("../../../api/chats", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/chats")>()), sendMessage }));
vi.mock("../../../api/messageCrypto", () => ({ encryptMessageContent }));

import { GuestMeetingLinkControl } from "./GuestMeetingLinkControl";

const chat = { id: "created-chat", title: "Design review" } as Chat;

describe("GuestMeetingLinkControl meeting chat creation", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    createGuestMeeting.mockReset().mockResolvedValue({
      title: "Planning",
      meetingUrl: "https://stovo.example/meet/abc",
      admissionMode: "immediate",
      scheduledAt: null
    });
    sendMessage.mockReset().mockResolvedValue(undefined);
    encryptMessageContent.mockReset().mockResolvedValue({ content: "encrypted invite", encryption: null });
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container.remove();
  });

  async function render(onCreateChat: (title: string) => Promise<Chat | null>) {
    await act(async () => {
      root?.render(<MemoryRouter><GuestMeetingLinkControl accessToken="token" chatId="new" sourceChat={null} onCreateChat={onCreateChat} newChatTitle="Design review" currentUserId="host" enabled /></MemoryRouter>);
    });
    const name = container.querySelector<HTMLInputElement>('.guest-link-control > .guest-link-field input')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(name, "Planning");
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
    return container.querySelector<HTMLButtonElement>(".guest-link-create-button")!;
  }

  it("creates the chat before the meeting and posts the invite after the meeting succeeds", async () => {
    const order: string[] = [];
    const onCreateChat = vi.fn(async () => { order.push("chat"); return chat; });
    createGuestMeeting.mockImplementation(async (_token, payload) => {
      order.push("meeting");
      expect(payload.chatId).toBe("created-chat");
      return { title: "Planning", meetingUrl: "https://stovo.example/meet/abc", admissionMode: "immediate", scheduledAt: null };
    });
    encryptMessageContent.mockImplementation(async () => { order.push("encrypt"); return { content: "encrypted invite", encryption: null }; });
    sendMessage.mockImplementation(async () => { order.push("invite"); });

    const button = await render(onCreateChat);
    expect(button.textContent).toContain("Create meeting link");
    await act(async () => { button.click(); });

    expect(onCreateChat).toHaveBeenCalledWith("Design review");
    expect(order).toEqual(["chat", "meeting", "encrypt", "invite"]);
    expect(createGuestMeeting).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith("token", "created-chat", "encrypted invite", [], null, null, null);
  });

  it("does not create a meeting when chat creation fails", async () => {
    const onCreateChat = vi.fn(async () => null);
    const button = await render(onCreateChat);
    await act(async () => { button.click(); });

    expect(createGuestMeeting).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Could not create guest link");
  });

  it("does not post an invite when meeting creation fails after the chat was created", async () => {
    const onCreateChat = vi.fn(async () => chat);
    createGuestMeeting.mockRejectedValueOnce(new Error("meeting service unavailable"));
    const button = await render(onCreateChat);
    await act(async () => { button.click(); });

    expect(onCreateChat).toHaveBeenCalledTimes(1);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(container.textContent).toContain("meeting service unavailable");
  });
});
