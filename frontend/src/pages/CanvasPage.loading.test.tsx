import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getCanvas: vi.fn(), getDocument: vi.fn(), drawingImports: vi.fn() }));
vi.mock("../api/canvas", () => ({ getCanvas: mocks.getCanvas, getCanvasDocument: mocks.getDocument, appendCanvasDocumentUpdate: vi.fn().mockResolvedValue({}), renameCanvas: vi.fn(), linkCanvas: vi.fn() }));
vi.mock("@excalidraw/excalidraw", () => { mocks.drawingImports(); return { Excalidraw: () => <div>Drawing editor</div> }; });
vi.mock("react-router-dom", () => ({ useParams: () => ({ canvasId: "canvas-1" }), useNavigate: () => vi.fn() }));
vi.mock("socket.io-client", () => ({ io: () => ({ on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }) }));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ accessToken: "token", currentUser: { id: "owner" } }) }));
vi.mock("../components/BackButton", () => ({ BackButton: () => null }));
vi.mock("../features/chats/conversation/MessageDialogs", () => ({ ForwardChatDialog: () => null }));
vi.mock("../i18n/LanguageContext", () => ({ useStrings: () => ({ auditUi: { openingCanvas: "Opening canvas", canvasUnavailable: "Unavailable", canvasName: "Canvas name", insertIntoCanvas: "Insert into canvas", whiteboard: "Whiteboard" } }) }));
import CanvasPage from "./CanvasPage";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(() => { if (root) act(() => root?.unmount()); container?.remove(); mocks.getCanvas.mockReset(); mocks.getDocument.mockReset(); });
async function mount() {
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  await act(async () => { root?.render(<CanvasPage />); });
}
it("shows canvas metadata while its document is still loading", async () => {
  mocks.getCanvas.mockResolvedValue({ id: "canvas-1", title: "Planning board", canManage: true });
  mocks.getDocument.mockReturnValue(new Promise(() => undefined));
  await mount();
  expect(mocks.getDocument).toHaveBeenCalledOnce();
  expect(container.querySelector("h1")?.textContent).toBe("Planning board");
  expect(container.querySelector('[aria-label="Insert into canvas"]')?.hasAttribute("disabled")).toBe(true);
});
it("opens a markdown canvas without evaluating the drawing editor bundle", async () => {
  mocks.getCanvas.mockResolvedValue({ id: "canvas-1", title: "Planning board", canManage: true });
  mocks.getDocument.mockResolvedValue({ updates: [] });
  await mount();
  expect(container.querySelector('[contenteditable="true"]')).not.toBeNull();
  expect(mocks.drawingImports).not.toHaveBeenCalled();
});
