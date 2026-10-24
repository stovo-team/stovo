import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import * as Y from "yjs";
const mocks = vi.hoisted(() => ({ create: vi.fn(), append: vi.fn(), getCanvas: vi.fn(), getDocument: vi.fn(), navigate: vi.fn(), canvasId: "unopened" }));
vi.mock("../api/canvas", () => ({ createCanvas: mocks.create, getCanvas: mocks.getCanvas, getCanvasDocument: mocks.getDocument, appendCanvasDocumentUpdate: mocks.append, renameCanvas: vi.fn(), linkCanvas: vi.fn() }));
vi.mock("@excalidraw/excalidraw", () => ({ Excalidraw: () => null }));
vi.mock("react-router-dom", () => ({ useParams: () => ({ canvasId: mocks.canvasId }), useNavigate: () => mocks.navigate }));
vi.mock("socket.io-client", () => ({ io: () => ({ on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }) }));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ accessToken: "token", currentUser: { id: "owner" } }) }));
vi.mock("../components/BackButton", () => ({ BackButton: () => null }));
vi.mock("../features/chats/conversation/MessageDialogs", () => ({ ForwardChatDialog: () => null }));
vi.mock("../i18n/LanguageContext", () => ({ useStrings: () => ({ audioPlayer: { retry: "Retry" }, auditUi: { openingCanvas: "Opening canvas", canvasUnavailable: "Unavailable", canvasDocument: "Canvas document", canvasName: "Canvas name", insertIntoCanvas: "Insert into canvas", whiteboard: "Whiteboard" } }) }));
import CanvasPage from "./CanvasPage";
import { createCanvasAndOpen } from "../features/chats/canvasCreation";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(() => { if (root) act(() => root?.unmount()); root = undefined; container?.remove(); sessionStorage.clear(); vi.clearAllMocks(); vi.useRealTimers(); });
const saved = { id: "created-canvas", familyId: "family", originChatId: "chat", createdBy: "owner", title: "Untitled canvas", linkedChatIds: ["chat"], canManage: true, createdAt: "2026-10-20", updatedAt: "2026-10-20" };
async function mount() {
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  await act(async () => { root?.render(<CanvasPage key={mocks.canvasId} />); });
}
function edit(text: string) {
  const editor = container.querySelector<HTMLDivElement>('[contenteditable="true"]')!;
  editor.innerHTML = `<p>${text}</p>`;
  editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
}
it("opens an editable draft before creation resolves and preserves pending edits during reconciliation", async () => {
  let resolveCreate!: (canvas: typeof saved) => void;
  mocks.create.mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; })); mocks.append.mockResolvedValue({});
  let resolveHistory!: (history: { updates: Array<{ update: string }> }) => void;
  mocks.getCanvas.mockResolvedValue(saved); mocks.getDocument.mockReturnValue(new Promise((resolve) => { resolveHistory = resolve; }));
  mocks.navigate.mockImplementation((path: string) => { mocks.canvasId = path.split("/").at(-1)!; });
  createCanvasAndOpen("token", { id: "chat", familyId: "family" }, "owner", mocks.navigate);
  expect(mocks.navigate).toHaveBeenCalledOnce();
  expect(mocks.canvasId).toMatch(/^draft-/);
  await mount();
  expect(container.querySelector('[contenteditable="true"]')).not.toBeNull();
  expect(container.querySelector(".canvas-title-edit")).toBeNull();
  await act(async () => { edit("Typed before the server replied"); });
  await act(async () => { resolveCreate(saved); });
  expect(mocks.navigate).toHaveBeenLastCalledWith(expect.stringContaining("/app/canvas/created-canvas"), { replace: true });
  await act(async () => { root?.render(<CanvasPage key={mocks.canvasId} />); });
  expect(container.textContent).toContain("Typed before the server replied");
  expect(container.querySelector(".canvas-title-edit")).not.toBeNull();
  vi.useFakeTimers();
  await act(async () => { edit("Typed while document history is pending"); await vi.advanceTimersByTimeAsync(180); });
  await act(async () => { resolveHistory({ updates: [{ update: mocks.create.mock.calls[0][3] }] }); });
  expect(container.textContent).toContain("Typed while document history is pending");
  const doc = new Y.Doc();
  for (const [, , update] of mocks.append.mock.calls) Y.applyUpdate(doc, Uint8Array.from(atob(update), (c) => c.charCodeAt(0)));
  expect(doc.getArray<Y.Map<unknown>>("blocks").toArray().map((block) => String(block.get("content"))).join(" ")).toContain("Typed while document history is pending");
  expect(doc.getArray("blocks").length).toBe(1);
  doc.destroy();
});
it("retains an editable draft after creation fails and can retry without losing text", async () => {
  mocks.create.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(saved); mocks.append.mockResolvedValue({});
  mocks.navigate.mockImplementation((path: string) => { mocks.canvasId = path.split("/").at(-1)!; });
  createCanvasAndOpen("token", { id: "chat", familyId: "family" }, "owner", mocks.navigate);
  expect(mocks.navigate).toHaveBeenCalledOnce();
  await mount();
  await act(async () => { edit("Keep my draft"); });
  expect(container.textContent).toContain("Offline");
  expect(container.querySelector('[contenteditable="true"]')).not.toBeNull();
  await act(async () => { const retry = container.querySelector<HTMLButtonElement>('[data-canvas-retry]')!; retry.click(); retry.click(); });
  expect(mocks.create).toHaveBeenCalledTimes(2);
  expect(mocks.create.mock.calls[1][4]).toBe(mocks.create.mock.calls[0][4]);
  expect(mocks.create.mock.calls[0][4]).toMatch(/^[0-9a-f-]{36}$/);
  const restored = new Y.Doc();
  Y.applyUpdate(restored, Uint8Array.from(atob(mocks.create.mock.calls[1][3]), (c) => c.charCodeAt(0)));
  expect(String(restored.getArray<Y.Map<unknown>>("blocks").get(0).get("content"))).toContain("Keep my draft");
  restored.destroy();
  expect(mocks.navigate).toHaveBeenLastCalledWith(expect.stringContaining("created-canvas"), { replace: true });
});
it("keeps the latest recovery snapshot when a later canonical save fails", async () => {
  let resolveCreate!: (canvas: typeof saved) => void;
  let resolveFirstSave!: (value: object) => void;
  mocks.create.mockReset().mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; }));
  mocks.append.mockReset().mockResolvedValueOnce({}).mockImplementationOnce(() => new Promise((resolve) => { resolveFirstSave = resolve; })).mockRejectedValue(new Error("Save offline"));
  mocks.getCanvas.mockResolvedValue(saved); mocks.getDocument.mockReturnValue(new Promise(() => undefined));
  mocks.navigate.mockImplementation((path: string) => { mocks.canvasId = path.split("/").at(-1)!; });
  createCanvasAndOpen("token", { id: "chat", familyId: "family" }, "owner", mocks.navigate);
  await mount();
  await act(async () => { resolveCreate(saved); });
  await act(async () => { root?.render(<CanvasPage key={mocks.canvasId} />); });
  vi.useFakeTimers();
  await act(async () => { edit("Recover my newest pending edit"); await vi.advanceTimersByTimeAsync(180); });
  expect(mocks.append).toHaveBeenCalledTimes(2);
  await act(async () => { resolveFirstSave({}); });
  expect(container.querySelector('[contenteditable="true"]')).not.toBeNull();
  await act(async () => { root?.unmount(); }); root = undefined;
  const stored = Object.keys(sessionStorage).map((key) => JSON.parse(sessionStorage.getItem(key)!)).find((value) => value.serverCanvas?.id === saved.id);
  expect(stored).toBeDefined();
  const recovered = new Y.Doc();
  Y.applyUpdate(recovered, Uint8Array.from(atob(stored.update), (char) => char.charCodeAt(0)));
  expect(String(recovered.getArray<Y.Map<unknown>>("blocks").get(0).get("content"))).toContain("Recover my newest pending edit");
  recovered.destroy();
});
it("keeps background saves on the originating Space after the user switches servers", async () => {
  const { getApiUrl } = await import("../api/client");
  const original = getApiUrl();
  const previous = localStorage.getItem("familyMessenger.apiUrl");
  let resolveCreate!: (canvas: typeof saved) => void;
  mocks.create.mockReset().mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; })); mocks.append.mockReset().mockResolvedValue({});
  try {
    createCanvasAndOpen("token", { id: "chat", familyId: "family" }, "owner", mocks.navigate);
    localStorage.setItem("familyMessenger.apiUrl", "https://another-space.example");
    await act(async () => { resolveCreate(saved); });
    expect(mocks.append).toHaveBeenCalledWith("token", saved.id, expect.any(String), original);
  } finally {
    if (previous === null) localStorage.removeItem("familyMessenger.apiUrl"); else localStorage.setItem("familyMessenger.apiUrl", previous);
  }
});
