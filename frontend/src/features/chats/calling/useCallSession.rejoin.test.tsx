import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { Chat } from "../../../api/chats";
import { useCallSession } from "./useCallSession";

vi.mock("./useMockCallSession", () => ({
  useMockCallSession: () => ({ isEnabled: false, endActiveCall: () => false, joinOngoingGroupCall: () => true, joinVoiceChannel: () => true, acceptIncomingCall: () => true }),
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it.each(["group", "voice", "incoming"] as const)("allows an explicit %s rejoin after masking stale departed-participant snapshots", async (entry) => {
  const activeCall = { roomId: "room-rejoin", callerId: "host", participants: [{ userId: "me", state: "connected" }, { userId: "host", state: "connected" }, { userId: "third", state: "connected" }] };
  const chat = { id: "chat-rejoin", type: "group", title: "Group", activeCall, members: [] } as unknown as Chat;
  let chats = [chat];
  const params = { accessToken: null, currentUser: { id: "me", displayName: "Me" }, selectedChat: chat, chats, members: [], chatId: chat.id, navigate: vi.fn(), prefersReducedMotion: true, setError: vi.fn(), chatsRef: { current: chats }, activeChatIdRef: { current: chat.id }, messageCacheRef: { current: {} }, setSelectedChat: vi.fn(), setMessages: vi.fn(), setIsDetailsOpen: vi.fn(), socketRef: { current: null }, restoreActiveVideoSurface: vi.fn(), setIsVideoPictureInPictureActive: vi.fn(), videoPictureInPictureActiveRef: { current: false }, lastNativeVideoRevisionRef: { current: 0 }, onChatsUpdate: (update: (current: Chat[]) => Chat[]) => { chats = update(chats); } } as unknown as Parameters<typeof useCallSession>[0];
  let call!: ReturnType<typeof useCallSession>;
  function Harness() { call = useCallSession(params); return null; }
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const ownState = () => call.activeGroupCalls[chat.id]?.participants.find((participant: { userId: string }) => participant.userId === "me").state;
  const receiveSnapshot = () => { chats = [{ ...chat }]; params.chats = chats; params.chatsRef.current = chats; root.render(<Harness />); };
  try {
    act(() => root.render(<Harness />));
    act(() => { call.setCallPhase("in-call"); call.setActiveCallChatId(chat.id); });
    call.callPhaseRef.current = "in-call"; call.callRoomIdRef.current = activeCall.roomId;
    call.audioCallRef.current = { cleanup: vi.fn(async () => undefined) } as unknown as NonNullable<typeof call.audioCallRef.current>;
    await act(async () => { await call.endActiveCall(); });
    expect(ownState()).toBe("left");
    act(receiveSnapshot);
    expect(ownState()).toBe("left");
    await act(async () => {
      if (entry === "group") await call.joinOngoingGroupCall(chat, activeCall, { micMuted: false, cameraEnabled: false });
      else if (entry === "voice") await call.joinVoiceChannel(chat);
      else { call.callRoomIdRef.current = activeCall.roomId; await call.acceptIncomingCall(); }
    });
    act(receiveSnapshot);
    expect(ownState()).toBe("connected");
    expect(chats[0].activeCall?.participants.find((participant: { userId: string }) => participant.userId === "me").state).toBe("connected");
  } finally { act(() => root.unmount()); host.remove(); }
});
