import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  previewGuestMeeting: vi.fn(async () => ({
    title: "Daily standup",
    scheduledAt: "2026-09-12T09:00:00.000Z",
    admissionMode: "immediate" as const,
    expiresAt: "2026-09-12T10:00:00.000Z",
    guestCount: 0,
    guestLimit: 10,
  })),
}));
const GuestMeetingLinkError = vi.hoisted(() => class GuestMeetingLinkError extends Error {
  constructor(message: string, readonly code?: string) { super(message); }
});
const auth = vi.hoisted(() => ({
  accessToken: null as string | null,
  currentUser: null as { displayName: string; username: string; profilePhoto: null } | null,
}));

vi.mock("../api/guestMeetings", () => ({
  previewGuestMeeting: api.previewGuestMeeting,
  createGuestMeetingSession: vi.fn(),
  getGuestMeetingStatus: vi.fn(),
  getGuestMeetingToken: vi.fn(),
  getGuestMeetingIntelligence: vi.fn(async () => ({ notesState: "idle", recordingState: "idle" })),
  GuestMeetingLinkError,
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => auth,
}));

class FakeTrack {
  enabled = true;
  stop = vi.fn();
  constructor(readonly kind: "audio" | "video") {}
}

class FakeMediaStream {
  private tracks: FakeTrack[];
  constructor(tracks: FakeTrack[] = []) { this.tracks = tracks; }
  addTrack(track: FakeTrack) { this.tracks.push(track); }
  getTracks() { return this.tracks; }
  getAudioTracks() { return this.tracks.filter((track) => track.kind === "audio"); }
  getVideoTracks() { return this.tracks.filter((track) => track.kind === "video"); }
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function renderPage() {
  const { default: GuestMeetingPage } = await import("./GuestMeetingPage");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<MemoryRouter initialEntries={["/guest/token"]}><Routes><Route path="/guest/:token" element={<GuestMeetingPage />} /></Routes></MemoryRouter>);
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  auth.accessToken = null;
  auth.currentUser = null;
  vi.stubGlobal("MediaStream", FakeMediaStream);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      enumerateDevices: vi.fn(async () => [
        { kind: "audioinput", deviceId: "mic-1", label: "Studio mic" },
        { kind: "audiooutput", deviceId: "speaker-1", label: "Desk speakers" },
        { kind: "videoinput", deviceId: "camera-1", label: "Desk camera" },
      ]),
      getUserMedia: vi.fn(async (constraints: MediaStreamConstraints) => new FakeMediaStream([
        new FakeTrack(constraints.audio ? "audio" : "video"),
      ])),
    },
  });
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("GuestMeetingPage pre-join controls", () => {
  it("prefills the name field from the signed-in user without making it read-only", async () => {
    auth.currentUser = { displayName: "Ivan Petrov", username: "ivan", profilePhoto: null };
    await renderPage();

    const nameInput = host?.querySelector<HTMLInputElement>('input[placeholder="Enter your name"]');
    expect(nameInput?.value).toBe("Ivan Petrov");
    expect(nameInput?.disabled).toBe(false);
  });

  it("starts media immediately and renders compact device menus", async () => {
    await renderPage();

    const mediaDevices = navigator.mediaDevices as MediaDevices & { getUserMedia: ReturnType<typeof vi.fn> };
    expect(mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
    expect(host?.querySelector<HTMLButtonElement>('[aria-label="Toggle Microphone"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(host?.querySelector<HTMLButtonElement>('[aria-label="Toggle Speaker"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(host?.querySelector<HTMLButtonElement>('[aria-label="Toggle Camera"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(host?.querySelector<HTMLButtonElement>('[aria-label="Select Microphone"]')).not.toBeNull();
    expect(host?.querySelector<HTMLButtonElement>('[aria-label="Select Speaker"]')).not.toBeNull();
    expect(host?.querySelector<HTMLButtonElement>('[aria-label="Select Camera"]')).not.toBeNull();
    expect(host?.querySelector("select")).toBeNull();
    expect(host?.textContent).not.toContain("Stovo guest meeting");
    expect(host?.textContent).not.toContain("Starts when the host opens the meeting");
    expect(host?.textContent).not.toContain("Camera unavailable — you can still join with your microphone");
  });

  it("opens a device menu and selects a device", async () => {
    await renderPage();
    const trigger = host?.querySelector<HTMLButtonElement>('[aria-label="Select Microphone"]');
    await act(async () => { trigger?.click(); });

    expect(host?.querySelector('[role="listbox"][aria-label="Microphone device"]')).not.toBeNull();
    expect(host?.textContent).toContain("Studio mic");

    const option = Array.from(host?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []).find((button) => button.textContent?.includes("Studio mic"));
    await act(async () => { option?.click(); });
    expect(host?.querySelector('[role="listbox"][aria-label="Microphone device"]')).toBeNull();
  });

  it("uses the halo wrapper for the camera-off speaking avatar", async () => {
    await renderPage();
    const cameraToggle = host?.querySelector<HTMLButtonElement>('[aria-label="Toggle Camera"]');
    await act(async () => { cameraToggle?.click(); });

    expect(host?.querySelector(".guest-preview-avatar-halo .guest-preview-avatar")).not.toBeNull();
  });

  it("shows no guest count when the preview has no live-presence source", async () => {
    api.previewGuestMeeting.mockResolvedValueOnce({
      title: "Daily standup",
      scheduledAt: "2026-09-12T09:00:00.000Z",
      admissionMode: "immediate",
      expiresAt: "2026-09-12T10:00:00.000Z",
      guestCount: 0,
      guestLimit: 10,
    });
    await renderPage();

    expect(host?.querySelector(".guest-prejoin-attendee-avatars")).toBeNull();
    expect(host?.querySelectorAll(".guest-prejoin-guest-avatar")).toHaveLength(0);
    expect(host?.querySelector(".guest-prejoin-attendee-copy")?.textContent).toContain("No guests are here yet");
  });

  it("treats an expired meeting link as a normal request for a new link", async () => {
    api.previewGuestMeeting.mockRejectedValueOnce(new GuestMeetingLinkError("This meeting link has expired. Ask the host for a new link.", "meeting_expired"));
    await renderPage();

    expect(host?.querySelector(".guest-link-expired")?.textContent).toContain("This meeting link has expired");
    expect(host?.textContent).toContain("Ask the host to send you a new link");
    expect(host?.querySelector(".error-text")).toBeNull();
  });

  it("opens and closes the settings popover with speaker and microphone tests", async () => {
    await renderPage();
    const trigger = host?.querySelector<HTMLButtonElement>('[aria-label="Open device settings"]');
    await act(async () => { trigger?.click(); });

    expect(host?.querySelector('[role="dialog"][aria-label="Device settings"]')).not.toBeNull();
    expect(host?.querySelector<HTMLInputElement>('[aria-label="Microphone volume"]')?.value).toBe("100");
    expect(host?.querySelector<HTMLInputElement>('[aria-label="Speaker volume"]')?.value).toBe("100");
    expect(host?.textContent).toContain("Test sound");

    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(host?.querySelector('[role="dialog"][aria-label="Device settings"]')).toBeNull();
  });
});
