import { useEffect, useRef, useState } from "react";
import type { NavigateFunction } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import * as Y from "yjs";
import { appendCanvasDocumentUpdate, getCanvas, getCanvasDocument, type Canvas } from "../../api/canvas";
import { getApiUrl, getClusterPrefix } from "../../api/client";
import { getSocketConfigForUrl } from "../../api/serverRegistry";
import { consumeCanvasDraft, encodeCanvasDraft, getCanvasDraft, retryCanvasDraft, subscribeCanvasDraft, type CanvasDraft } from "../chats/canvasDrafts";
import { createClientMessageId } from "../chats/shared/messageState";

export const canvasRemoteOrigin = Symbol("canvas-remote");
const decode = (update: string) => Uint8Array.from(atob(update), (char) => char.charCodeAt(0));
const encode = (update: Uint8Array) => btoa(Array.from(update, (byte) => String.fromCharCode(byte)).join(""));

/** Own one editor document across draft creation, canonical reconciliation, and remote updates. */
export function useCanvasDocumentSession(canvasId: string, accessToken: string | null, ownerId: string | undefined, navigate: NavigateFunction) {
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [document, setDocument] = useState<Y.Doc | null>(null);
  const [blocksRevision, setBlocksRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draft, setDraft] = useState<CanvasDraft | null>(null);
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    if (!accessToken || !canvasId || !ownerId) return;
    setCanvas(null); setDocument(null); setError(null); setDraftError(null); setDraft(null);
    const local = getCanvasDraft(canvasId, ownerId);
    if (local) {
      setDraft(local); setCanvas(local.canvas); setDocument(local.document);
      const refresh = () => {
        setDraftError(local.error);
        if (local.serverCanvas && getApiUrl() === local.apiBaseUrl) navigateRef.current(`${getClusterPrefix()}/app/canvas/${encodeURIComponent(local.serverCanvas.id)}`, { replace: true });
      };
      const revise = () => setBlocksRevision((revision) => revision + 1);
      local.document.getArray("blocks").observe(revise);
      refresh();
      const unsubscribe = subscribeCanvasDraft(local, refresh);
      return () => { unsubscribe(); local.document.getArray("blocks").unobserve(revise); };
    }
    const apiBaseUrl = getApiUrl();
    let cancelled = false;
    let socket: Socket | null = null;
    let saving = false;
    let timer: number | null = null;
    const queue: Array<{ update: string; recovery: string }> = [];
    const pending: Uint8Array[] = [];
    const snapshot = consumeCanvasDraft(canvasId, ownerId);
    const doc = new Y.Doc();
    if (snapshot) {
      Y.applyUpdate(doc, decode(snapshot.update), canvasRemoteOrigin);
      setCanvas(snapshot.canvas); setDocument(doc);
    }
    const blocks = doc.getArray<Y.Map<unknown>>("blocks");
    blocks.observe(() => setBlocksRevision((revision) => revision + 1));
    const flush = async () => {
      if (saving || cancelled) return;
      saving = true;
      try {
        while (queue.length && !cancelled) {
          const update = queue[0];
          await appendCanvasDocumentUpdate(accessToken, canvasId, update.update, apiBaseUrl);
          queue.shift();
          if (!cancelled && !queue.length && !pending.length) snapshot?.acknowledge(update.recovery);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not save Canvas changes");
      } finally { saving = false; }
    };
    const savePending = () => {
      timer = null;
      if (!pending.length) return;
      snapshot?.retain(doc);
      queue.push({ update: encode(Y.mergeUpdates(pending.splice(0))), recovery: encodeCanvasDraft(doc) });
      void flush();
    };
    doc.on("update", (update, origin) => {
      if (origin === canvasRemoteOrigin) return;
      snapshot?.retain(doc);
      pending.push(update);
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(savePending, 180);
    });
    // Persist the transferred state before waiting for document history; the editor is already live.
    if (snapshot) { queue.push({ update: snapshot.update, recovery: snapshot.update }); void flush(); }
    const connect = async () => {
      try {
        const metadata = getCanvas(accessToken, canvasId).then((loaded) => {
          if (!cancelled) setCanvas(loaded);
          return loaded;
        });
        const [loaded, history] = await Promise.all([metadata, getCanvasDocument(accessToken, canvasId)]);
        if (cancelled) return;
        history.updates.forEach(({ update }) => Y.applyUpdate(doc, decode(update), canvasRemoteOrigin));
        setCanvas(loaded); setDocument(doc);
        const socketConfig = getSocketConfigForUrl(getApiUrl());
        socket = io(socketConfig.origin, { path: socketConfig.path, auth: { token: accessToken }, query: { token: accessToken }, transports: ["websocket", "polling"] });
        socket.on("connect", () => socket?.emit("canvas:join", { canvasId }));
        socket.on("canvas:update", (payload: { canvasId?: string; update?: string }) => {
          if (payload.canvasId === canvasId && payload.update) Y.applyUpdate(doc, decode(payload.update), canvasRemoteOrigin);
        });
        socket.on("canvas:error", (payload: { canvasId?: string; message?: string }) => {
          if (payload.canvasId === canvasId) setError(payload.message ?? "Canvas is unavailable");
        });
        if (!blocks.length) {
          const block = new Y.Map<unknown>();
          block.set("id", createClientMessageId()); block.set("kind", "markdown"); block.set("content", new Y.Text(`# ${loaded.title}\n\n`));
          doc.transact(() => blocks.push([block]));
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not open Canvas");
      }
    };
    void connect();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      if (pending.length || queue.length) {
        snapshot?.retain(doc);
        const recovery = encodeCanvasDraft(doc);
        void appendCanvasDocumentUpdate(accessToken, canvasId, recovery, apiBaseUrl).then(() => snapshot?.acknowledge(recovery)).catch(() => undefined);
      }
      socket?.disconnect(); doc.destroy();
    };
  }, [accessToken, canvasId, ownerId]);

  return { canvas, setCanvas, document, blocksRevision, error, setError, draftError,
    retryDraft: draft && accessToken ? () => retryCanvasDraft(draft, accessToken) : null };
}
