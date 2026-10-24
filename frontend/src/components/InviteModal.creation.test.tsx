import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import InviteModal from "./InviteModal";
import { createInvite, type InviteResponse } from "../api/family";
vi.mock("../api/family", async (original) => ({ ...await original<typeof import("../api/family")>(), createInvite: vi.fn() }));
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(() => Promise.resolve("data:image/png;base64,AA==")) } }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it("reuses an in-flight invitation when the dialog is quickly reopened", async () => {
  let resolve!: (response: InviteResponse) => void;
  vi.mocked(createInvite).mockReturnValue(new Promise((done) => { resolve = done; }));
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const render = (open: boolean) => root.render(<InviteModal accessToken="token" familyName="Demo" open={open} onClose={vi.fn()} />);
  try {
    act(() => render(true));
    act(() => render(false));
    act(() => render(true));
    expect(createInvite).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ inviteUrl: "http://localhost/invite/demo", invite: { expiresAt: new Date(Date.now() + 3600000).toISOString() } } as InviteResponse); });
    expect(host.textContent).toContain("/invite/demo");
    expect(host.textContent).not.toContain("Creating invite");
  } finally { act(() => root.unmount()); host.remove(); }
});
it("finishes creation when React replays the initial effect", async () => {
  const { StrictMode } = await import("react");
  let resolve!: (response: InviteResponse) => void;
  vi.mocked(createInvite).mockClear();
  vi.mocked(createInvite).mockReturnValue(new Promise((done) => { resolve = done; }));
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    act(() => root.render(<StrictMode><InviteModal accessToken="token" familyName="Demo" open onClose={vi.fn()} /></StrictMode>));
    await act(async () => { resolve({ inviteUrl: "http://localhost/invite/replayed" } as InviteResponse); });
    expect(host.textContent).toContain("/invite/replayed");
    expect(createInvite).toHaveBeenCalledTimes(1);
  } finally { act(() => root.unmount()); host.remove(); }
});
