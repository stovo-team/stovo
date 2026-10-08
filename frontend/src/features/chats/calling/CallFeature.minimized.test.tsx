import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { QuickAccessPanel } from "../QuickAccessPanel";
import { CallFeature } from "./CallFeature";
import { CallFeatureProvider } from "./CallFeatureContext";
import { DEFAULT_CALL_SETTINGS } from "../../../realtime/call/types";
import type { CallSessionApi } from "./useCallSession";
import type { Chat } from "../../../api/chats";
// Expanded recording/transcription controls use network and device services.
vi.mock("./DesktopCallControls", () => ({ DesktopCallControls: () => null }));
vi.mock("./MobileActiveScreen", () => ({ MobileActiveScreen: () => null }));
let root: Root;
afterEach(() => { act(() => root?.unmount()); document.body.innerHTML = ""; });
for (const type of ["direct", "group", "family", "voice"] as const) {
  for (const mobile of [false, true]) {
    for (const route of ["/app/chats/chat", "/app/settings"]) {
      it(`renders exactly one minimized surface for ${type}, mobile=${mobile}, ${route}`, () => {
        const patch = vi.fn(), expand = vi.fn(), open = vi.fn(), end = vi.fn();
        const chat = { id: "chat", type, title: "Call title", members: [] } as unknown as Chat;
        const session = {
          callPhase: "in-call", callType: "audio", isCallMinimized: route.includes("chats"),
          activeCallChatId: "chat", callRoomId: "room", callTimer: "00:42",
          callAudioSettings: DEFAULT_CALL_SETTINGS, callRemoteMedia: [], speakingUserIds: [],
          localVideoStream: null, localScreenStream: null, remoteVideoStream: null,
          activeGroupCalls: {}, callAudioCapabilities: {}, setIsCallMinimized: expand, applyCallAudioPatch: patch, endActiveCall: end,
        } as unknown as CallSessionApi;
        const showDrafts = type === "voice" && !mobile && route.includes("chats");
        const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
        act(() => root.render(<MemoryRouter initialEntries={[route]}><CallFeatureProvider session={session} isMobileViewport={mobile} members={[]} currentUser={null} chats={[chat]} onOpenChat={open}>{showDrafts && <QuickAccessPanel accessToken={null} chats={[]} onOpenChat={open} />}<CallFeature /></CallFeatureProvider></MemoryRouter>));
        expect(document.querySelectorAll('[aria-label="Minimized call"]')).toHaveLength(1);
        if (showDrafts) {
          expect(host.querySelector('[aria-label="Drafts and scheduled messages"]')).not.toBeNull();
          expect(host.querySelector('[aria-label="Minimized call"]')).toBeNull();
        }
        expect(document.querySelector<HTMLElement>(".call-popup")?.hidden ?? true).toBe(true);
        expect(document.body.textContent).toContain("Call title · 00:42");
        act(() => document.querySelector<HTMLButtonElement>('[aria-label="Mute speaker"]')!.click());
        expect(patch).toHaveBeenCalledWith({ soundDisabled: true });
        act(() => document.querySelector<HTMLButtonElement>('[aria-label="End call"]')!.click());
        expect(end).toHaveBeenCalledOnce();
        act(() => document.querySelector<HTMLButtonElement>('[aria-label="Restore call"]')!.click());
        expect(expand).toHaveBeenCalledWith(false);
        expect(open).toHaveBeenCalledWith(chat);

      });
    }
  }
}
