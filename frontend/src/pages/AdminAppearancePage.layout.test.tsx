import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { Family } from "../api/family";
import { useChatWorkspaceState } from "../features/chats/sidebar/useChatWorkspaceState";
const mocks = vi.hoisted(() => ({ authRequest: vi.fn() }));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ accessToken: "token", authRequest: mocks.authRequest, currentUser: { id: "owner", role: "owner" } }) }));
vi.mock("./AppNav", () => ({ default: () => null }));
vi.mock("../components/BackButton", () => ({ BackButton: () => null }));
vi.mock("../i18n/LanguageContext", () => ({ useStrings: () => ({ admin: { appearance: { title: "Appearance", chatLayout: "Chat layout", saved: "Saved", minimizedLayout: "Minimized layout", minimizedLayoutDesc: "Compact chat rows", spaceOptions: "Space options" } } }) }));
import AdminAppearancePage from "./AdminAppearancePage";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const initial = { id: "family-current", minimizedChatLayout: false } as Family;
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(() => { if (root) act(() => root?.unmount()); container?.remove(); vi.clearAllMocks(); });
function CachedChatsProbe() {
  const { family, setFamily } = useChatWorkspaceState({ accessToken: "token" });
  useEffect(() => { setFamily(initial); }, [setFamily]);
  return <output>{family?.minimizedChatLayout ? "Compact chats" : "Full chats"}</output>;
}
async function mount() {
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  await act(async () => { root?.render(<><CachedChatsProbe /><AdminAppearancePage /></>); });
}
it("applies the saved layout to the already mounted chat workspace", async () => {
  mocks.authRequest.mockImplementation((_path, options) => Promise.resolve(options?.method === "PATCH" ? { ...initial, minimizedChatLayout: true } : initial));
  await mount();
  await act(async () => { container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); });
  expect(mocks.authRequest).toHaveBeenCalledWith("/api/family", { method: "PATCH", body: { minimizedChatLayout: true } });
  expect(container.querySelector("output")?.textContent).toBe("Compact chats");
});
it("does not apply a failed save to cached chats", async () => {
  mocks.authRequest.mockImplementation((_path, options) => options?.method === "PATCH" ? Promise.reject(new Error("offline")) : Promise.resolve(initial));
  await mount(); await act(async () => { container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); });
  expect(container.querySelector("output")?.textContent).toBe("Full chats");
});
it("ignores settings updates for a different space", async () => {
  mocks.authRequest.mockResolvedValue(initial); await mount();
  await act(async () => { window.dispatchEvent(new CustomEvent("stovo:family-updated", { detail: { ...initial, id: "other", minimizedChatLayout: true } })); });
  expect(container.querySelector("output")?.textContent).toBe("Full chats");
});
