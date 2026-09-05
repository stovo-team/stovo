import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import * as Y from "yjs";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { ArrowLeft, ChevronDown, Pencil, Plus, Share2 } from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import { getSocketConfigForUrl } from "../api/serverRegistry";
import { getApiUrl } from "../api/client";
import { appendCanvasDocumentUpdate, getCanvas, getCanvasDocument, linkCanvas, renameCanvas, type Canvas } from "../api/canvas";
import { MessageMarkdown } from "../messageMarkdown";
import type { Chat } from "../api/chats";
import { getChats } from "../api/chats";

const remoteOrigin = Symbol("canvas-remote");

type BlockKind = "markdown" | "whiteboard";
type CanvasBlock = { id: string; kind: BlockKind; record: Y.Map<unknown> };
type ExcalidrawAPI = { updateScene: (scene: { elements: unknown[] }) => void };

function bytesToBase64(value: Uint8Array) {
  let binary = "";
  value.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function documentBlocks(doc: Y.Doc): CanvasBlock[] {
  const blocks = doc.getArray<Y.Map<unknown>>("blocks");
  return blocks.toArray().flatMap((record) => {
    const id = record.get("id");
    const kind = record.get("kind");
    return typeof id === "string" && (kind === "markdown" || kind === "whiteboard")
      ? [{ id, kind, record: record as Y.Map<unknown> }]
      : [];
  });
}

function createBlock(kind: BlockKind, markdownContent = ""): Y.Map<unknown> {
  const record = new Y.Map<unknown>();
  record.set("id", crypto.randomUUID());
  record.set("kind", kind);
  if (kind === "markdown") record.set("content", new Y.Text(markdownContent));
  if (kind === "whiteboard") record.set("scene", new Y.Text());
  return record;
}

function MarkdownBlock({ record }: { record: Y.Map<unknown> }) {
  const text = record.get("content") as Y.Text;
  const [value, setValue] = useState(() => text?.toString() ?? "");

  useEffect(() => {
    const update = () => setValue(text?.toString() ?? "");
    text?.observe(update);
    return () => text?.unobserve(update);
  }, [text]);

  if (!text) return null;
  return (
    <section className="canvas-markdown-block">
      <div className="canvas-markdown-editor">
        <textarea
          aria-label="Canvas Markdown"
          value={value}
          placeholder="Write Markdown…"
          onChange={(event) => {
            const next = event.target.value;
            text.doc?.transact(() => { text.delete(0, text.length); text.insert(0, next); });
          }}
        />
        <article className="canvas-markdown-preview" aria-live="polite"><MessageMarkdown source={value} /></article>
      </div>
    </section>
  );
}

function WhiteboardBlock({ record }: { record: Y.Map<unknown> }) {
  const key = "scene";
  const [revision, setRevision] = useState(0);
  const apiRef = useRef<ExcalidrawAPI | null>(null);
  const sceneText = record.get(key) as Y.Text | undefined;

  useEffect(() => {
    if (!sceneText) return;
    const update = (_event: Y.YTextEvent, transaction: Y.Transaction) => {
      // Local changes already exist in Excalidraw. Applying them back through
      // updateScene interrupts an active pointer stroke and can reset it.
      if (transaction.origin !== remoteOrigin) return;
      setRevision((current) => current + 1);
      try { apiRef.current?.updateScene({ elements: JSON.parse(sceneText.toString()) }); } catch { /* keep the editor usable if a stale scene is received */ }
    };
    sceneText.observe(update);
    return () => sceneText.unobserve(update);
  }, [sceneText]);

  const elements = useMemo(() => {
    try { return sceneText?.toString() ? JSON.parse(sceneText.toString()) : []; } catch { return []; }
  }, [sceneText, revision]);

  if (!sceneText) return null;

  return (
    <section className="canvas-block canvas-whiteboard-block">
      <header><Pencil size={17} /> <strong>Whiteboard</strong><small>Live drawing</small></header>
      <div className="canvas-excalidraw">
        <Excalidraw
          excalidrawAPI={(api) => { apiRef.current = api as unknown as ExcalidrawAPI; }}
          initialData={{ elements }}
          onChange={(nextElements) => {
            const next = JSON.stringify(nextElements);
            if (sceneText.toString() === next) return;
            sceneText.doc?.transact(() => { sceneText.delete(0, sceneText.length); sceneText.insert(0, next); });
          }}
        />
      </div>
    </section>
  );
}

export default function CanvasPage() {
  const { canvasId = "" } = useParams();
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [document, setDocument] = useState<Y.Doc | null>(null);
  const [blocksRevision, setBlocksRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [insertOpen, setInsertOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [chats, setChats] = useState<Chat[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const saveQueueRef = useRef<string[]>([]);
  const isSavingRef = useRef(false);

  useEffect(() => {
    if (!accessToken || !canvasId) return;
    let cancelled = false;
    const doc = new Y.Doc();
    const blocks = doc.getArray<Y.Map<unknown>>("blocks");
    const connect = async () => {
      try {
        const [loadedCanvas, loadedDocument] = await Promise.all([getCanvas(accessToken, canvasId), getCanvasDocument(accessToken, canvasId)]);
        if (cancelled) return;
        loadedDocument.updates.forEach(({ update }) => Y.applyUpdate(doc, base64ToBytes(update), remoteOrigin));
        setCanvas(loadedCanvas);
        setDocument(doc);
        const socketConfig = getSocketConfigForUrl(getApiUrl());
        const socket = io(socketConfig.origin, { path: socketConfig.path, auth: { token: accessToken }, query: { token: accessToken }, transports: ["websocket", "polling"] });
        socketRef.current = socket;
        socket.on("connect", () => socket.emit("canvas:join", { canvasId }));
        socket.on("canvas:update", (payload: { canvasId?: string; update?: string }) => {
          if (payload.canvasId === canvasId && payload.update) Y.applyUpdate(doc, base64ToBytes(payload.update), remoteOrigin);
        });
        socket.on("canvas:error", (payload: { canvasId?: string; message?: string }) => {
          if (payload.canvasId === canvasId) setError(payload.message ?? "Canvas is unavailable");
        });
        const flushSaveQueue = async () => {
          if (isSavingRef.current || !accessToken || cancelled) return;
          isSavingRef.current = true;
          try {
            while (saveQueueRef.current.length > 0 && !cancelled) {
              const update = saveQueueRef.current[0];
              await appendCanvasDocumentUpdate(accessToken, canvasId, update);
              saveQueueRef.current.shift();
            }
          } catch (cause) {
            if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not save Canvas changes");
          } finally {
            isSavingRef.current = false;
          }
        };
        doc.on("update", (update, origin) => {
          if (origin === remoteOrigin) return;
          saveQueueRef.current.push(bytesToBase64(update));
          void flushSaveQueue();
        });
        blocks.observe(() => setBlocksRevision((current) => current + 1));
        if (blocks.length === 0) doc.transact(() => blocks.push([createBlock("markdown", `# ${loadedCanvas.title}\n\n`)]));
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not open Canvas");
      }
    };
    void connect();
    return () => { cancelled = true; socketRef.current?.disconnect(); socketRef.current = null; doc.destroy(); };
  }, [accessToken, canvasId]);

  useEffect(() => {
    if (!accessToken || !shareOpen) return;
    void getChats(accessToken).then(setChats).catch(() => undefined);
  }, [accessToken, shareOpen]);

  const blocks = useMemo(() => document ? documentBlocks(document) : [], [document, blocksRevision]);
  const addWhiteboard = () => {
    document?.transact(() => document.getArray<Y.Map<unknown>>("blocks").push([createBlock("whiteboard")]));
    setInsertOpen(false);
  };
  const saveTitle = async () => {
    if (!canvas || !accessToken) return;
    const title = titleDraft.trim();
    setIsEditingTitle(false);
    if (!title || title === canvas.title) return;
    setCanvas(await renameCanvas(accessToken, canvas.id, title));
  };

  if (error) return <main className="canvas-page canvas-page--error"><h1>Canvas unavailable</h1><p>{error}</p><button type="button" onClick={() => navigate(-1)}>Back</button></main>;
  if (!canvas || !document) return <main className="canvas-page canvas-page--loading">Opening Canvas…</main>;

  return (
    <main className="canvas-page">
      <header className="canvas-page-header">
        <button type="button" className="icon-button subtle" aria-label="Back" onClick={() => navigate(-1)}><ArrowLeft size={19} /></button>
        <div className="canvas-title-group">
          {isEditingTitle ? <input className="canvas-title-input" aria-label="Canvas name" autoFocus maxLength={160} value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} onBlur={() => void saveTitle()} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveTitle(); } if (event.key === "Escape") { setIsEditingTitle(false); } }} /> : <h1>{canvas.title}</h1>}
          {canvas.canManage && !isEditingTitle && <button type="button" className="canvas-title-edit" aria-label="Edit canvas name" title="Edit canvas name" onClick={() => { setTitleDraft(canvas.title); setIsEditingTitle(true); }}><Pencil size={13} /></button>}
        </div>
        <div className="canvas-page-actions">
          {canvas.canManage && <button type="button" className="canvas-icon-action" aria-label="Share canvas" title="Share canvas" onClick={() => setShareOpen((current) => !current)}><Share2 size={16} /></button>}
          <div className="canvas-insert-menu">
            <button type="button" className="canvas-add-button" aria-label="Insert into canvas" aria-expanded={insertOpen} onClick={() => setInsertOpen((current) => !current)}><Plus size={16} /><ChevronDown size={14} /></button>
            {insertOpen && <div className="canvas-insert-dropdown" role="menu"><button type="button" role="menuitem" onClick={addWhiteboard}><Pencil size={16} /><span><strong>Whiteboard</strong><small>Insert a live drawing board</small></span></button></div>}
          </div>
        </div>
      </header>
      {shareOpen && canvas.canManage && (
        <aside className="canvas-share-panel"><strong>Share in a chat</strong>{chats.filter((chat) => !canvas.linkedChatIds.includes(chat.id)).map((chat) => (
          <button key={chat.id} type="button" onClick={() => accessToken && void linkCanvas(accessToken, canvas.id, chat.id).then((next) => { setCanvas(next); setShareOpen(false); })}>{chat.title || "Direct chat"}</button>
        ))}</aside>
      )}
      <div className="canvas-workspace">
        {blocks.map((block) => block.kind === "markdown" ? <MarkdownBlock key={block.id} record={block.record} /> : <WhiteboardBlock key={block.id} record={block.record} />)}
      </div>
    </main>
  );
}
