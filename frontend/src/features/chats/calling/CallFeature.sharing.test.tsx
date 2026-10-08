import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { CallFeature } from "./CallFeature";
import { CallFeatureProvider } from "./CallFeatureContext";
import { DEFAULT_CALL_SETTINGS } from "../../../realtime/call/types";
import type { CallSessionApi } from "./useCallSession";

vi.mock("./DesktopCallControls", () => ({ DesktopCallControls: () => null }));
let root: Root;
afterEach(() => { act(() => root?.unmount()); document.body.innerHTML = ""; });

it("minimizes once after successful local capture without ending or restarting the call", () => {
  const minimize = vi.fn(), end = vi.fn();
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const session = {
    callPhase: "in-call", callType: "audio", activeCallChatId: "group", activeGroupCalls: {},
    callAudioSettings: DEFAULT_CALL_SETTINGS, callRemoteMedia: [], speakingUserIds: [], localScreenStream: null,
    setIsCallMinimized: minimize, endActiveCall: end,
  } as unknown as CallSessionApi;
  const render = () => act(() => root.render(
    <MemoryRouter initialEntries={["/app/chats/group"]}>
      <CallFeatureProvider session={session} isMobileViewport={false} members={[]} currentUser={null} chats={[{ id: "group", type: "group", members: [] } as never]}>
        <CallFeature />
      </CallFeatureProvider>
    </MemoryRouter>,
  ));
  render();
  expect(minimize).not.toHaveBeenCalled();
  session.localScreenStream = { getVideoTracks: () => [{ readyState: "live" }] } as unknown as MediaStream;
  render();
  expect(minimize).toHaveBeenCalledExactlyOnceWith(true);
  session.isCallMinimized = false;
  render();
  expect(minimize).toHaveBeenCalledTimes(1);
  expect(end).not.toHaveBeenCalled();
});
