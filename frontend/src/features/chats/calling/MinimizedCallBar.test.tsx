import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { MinimizedCallBar } from "./MinimizedCallBar";
let root: Root;
let host: HTMLDivElement | undefined;
afterEach(() => { act(() => root?.unmount()); host?.remove(); host = undefined; });
const stream = (readyState = "live") => ({ getVideoTracks: () => [{ readyState, enabled: true }] }) as unknown as MediaStream;
const alice = stream(), bob = stream(), local = stream(), screen = stream();
const media = (userId: string, camera = alice, sharing = false) => ({ userId, stream: camera, hasVideo: true, hasAudio: true, hasScreenShare: sharing, screenStream: sharing ? screen : null });
const defaults = { visible: true, peerName: "Family call", callPhase: "in-call" as const, callTimer: "01:23", micMuted: false, soundDisabled: false, onToggleMic: vi.fn(), onToggleSound: vi.fn(), onEnd: vi.fn(), onExpand: vi.fn(), remoteMedia: [], localVideoStream: null, localScreenStream: null, cameraEnabled: false, screenSharing: false, localUserId: "self", speakingUserIds: [], isLocalSpeaking: false, isPeerSpeaking: false, mirrorLocalVideo: true };
function render(patch: Record<string, unknown> = {}) {
  if (!host) { host = document.createElement("div"); document.body.append(host); root = createRoot(host); }
  act(() => root.render(<MinimizedCallBar {...defaults} {...patch} />));
  return host;
}
it("orders restore, microphone, speaker and end controls and wires their actions", () => {
  const host = render();
  expect([...host.querySelectorAll("button")].map(b => b.getAttribute("aria-label"))).toEqual(["Restore call", "Mute microphone", "Mute speaker", "End call"]);
  expect(host.textContent).toContain("Family call · 01:23");
  for (const b of host.querySelectorAll("button")) act(() => b.click());
  for (const handler of [defaults.onExpand, defaults.onToggleMic, defaults.onToggleSound, defaults.onEnd]) expect(handler).toHaveBeenCalledOnce();
  expect(host.querySelector("video")).toBeNull();
});
it("reflects both mute states", () => {
  const host = render({ micMuted: true, soundDisabled: true });
  expect(host.querySelector('[aria-label="Unmute microphone"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="Unmute speaker"]')).not.toBeNull();
});
it("follows the speaking camera and retains it through silence, falling back on departure", () => {
  const remoteMedia = [media("alice", alice), media("bob", bob)];
  const host = render({ remoteMedia, speakingUserIds: ["bob"] });
  expect(host.querySelector("video")?.srcObject).toBe(bob);
  render({ remoteMedia, speakingUserIds: [] });
  expect(host.querySelector("video")?.srcObject).toBe(bob);
  render({ remoteMedia, speakingUserIds: ["alice"] });
  expect(host.querySelector("video")?.srcObject).toBe(alice);
  render({ remoteMedia: [media("bob", bob)], speakingUserIds: [] });
  expect(host.querySelector("video")?.srcObject).toBe(bob);
});
it("gives remote and local shares priority over speaking cameras without mirroring", () => {
  const host = render({ remoteMedia: [media("alice", alice, true)], localVideoStream: local, cameraEnabled: true, isLocalSpeaking: true });
  expect(host.querySelector("video")?.srcObject).toBe(screen);
  expect(host.querySelector("video")?.classList.contains("is-mirrored")).toBe(false);
  render({ remoteMedia: [media("alice")], localScreenStream: screen, screenSharing: true });
  expect(host.querySelector("video")?.srcObject).toBe(screen);
});
it("mutes local previews and ignores ended cameras and stopped shares", () => {
  const host = render({ localVideoStream: local, cameraEnabled: true, isLocalSpeaking: true });
  expect(host.querySelector("video")?.srcObject).toBe(local);
  expect(host.querySelector("video")?.muted).toBe(true);
  expect(host.querySelector("video")?.classList.contains("is-mirrored")).toBe(true);
  render({ remoteMedia: [media("alice", stream("ended"))], localScreenStream: screen, screenSharing: false });
  expect(host.querySelector("video")).toBeNull();
});
it("tracks speakers while expanded without rendering a minimized surface", () => {
  const remoteMedia = [media("alice", alice), media("bob", bob)];
  const host = render({ remoteMedia, speakingUserIds: ["bob"], visible: false });
  expect(host.querySelector('[role="status"]')).toBeNull();
  render({ remoteMedia, speakingUserIds: [], visible: true });
  expect(host.querySelector("video")?.srcObject).toBe(bob);
});
it("retains the last speaking camera when the active speaker has audio only", () => {
  const remoteMedia = [media("alice", alice), media("bob", bob), { ...media("audio"), hasVideo: false }];
  const host = render({ remoteMedia, speakingUserIds: ["bob"] });
  render({ remoteMedia, speakingUserIds: ["audio"] });
  expect(host.querySelector("video")?.srcObject).toBe(bob);
  render({ remoteMedia, speakingUserIds: [] });
  expect(host.querySelector("video")?.srcObject).toBe(bob);
});
it("falls back immediately when a camera track mutes or ends", () => {
  const track = Object.assign(new EventTarget(), { readyState: "live", enabled: true, muted: false });
  const camera = { getVideoTracks: () => [track] } as unknown as MediaStream;
  const host = render({ remoteMedia: [media("alice"), media("bob", camera)], speakingUserIds: ["bob"] });
  expect(host.querySelector("video")?.srcObject).toBe(camera);
  act(() => { track.muted = true; track.dispatchEvent(new Event("mute")); });
  expect(host.querySelector("video")?.srcObject).toBe(alice);
  act(() => { track.muted = false; track.dispatchEvent(new Event("unmute")); });
  expect(host.querySelector("video")?.srcObject).toBe(camera);
  act(() => { track.readyState = "ended"; track.dispatchEvent(new Event("ended")); });
  expect(host.querySelector("video")?.srcObject).toBe(alice);
});
