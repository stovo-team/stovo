import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import * as Y from "yjs";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { ArrowLeft, Plus, Share2, Pencil, StickyNote } from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import { getSocketConfigForUrl } from "../api/serverRegistry";
import { getApiUrl } from "../api/client";
import { getCanvas, getCanvasDocument, linkCanvas, renameCanvas, type Canvas } from "../api/canvas";
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

function createBlock(kind: BlockKind): Y.Map<unknown> {
  const record = new Y.Map<unknown>();
  record.set("id", crypto.randomUUID());
  record.set("kind", kind);
  if (kind === "markdown") record.set("content", new Y.Text());
  if (kind === "whiteboard") record.set("scene", new Y.Text());
  return record;
}

function MarkdownBlock({ record }: { record: Y.Map<unknown> }) {
  const text = record.get("content") as Y.Text;
  const [value, setValue] = useState(() => text?.toString() ?? "");
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    const update = () => setValue(text?.toString() ?? "");
    text?.observe(update);
    return () => text?.unobserve(update);
  }, [text]);

  if (!text) return null;
  return (
    <section className="canvas-block canvas-markdown-block">
      <header><StickyNote size={17} /> <strong>Markdown</strong><button type="button" onClick={() => setPreview((current) => !current)}>{preview ? "Edit" : "Preview"}</button></header>
      {preview ? <article className="canvas-markdown-preview"><MessageMarkdown source={value} /></article> : (
        <textarea
          aria-label="Canvas Markdown"
          value={value}
          placeholder="Write Markdown…"
          onChange={(event) => {
            const next = event.target.value;
            text.doc?.transact(() => { text.delete(0, text.length); text.insert(0, next); });
          }}
        />
      )}
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
    const update = () => {
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
  const [chats, setChats] = useState<Chat[]>([]);
  const socketRef = useRef<Socket | null>(null);

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
        doc.on("update", (update, origin) => {
          if (origin === remoteOrigin) return;
          socket.emit("canvas:update", { canvasId, update: bytesToBase64(update) });
        });
        blocks.observe(() => setBlocksRevision((current) => current + 1));
        if (blocks.length === 0) doc.transact(() => blocks.push([createBlock("markdown")]));
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
  const addBlock = (kind: BlockKind) => document?.transact(() => document.getArray<Y.Map<unknown>>("blocks").push([createBlock(kind)]));
  const saveTitle = async () => {
    if (!canvas || !accessToken) return;
    const title = window.prompt("Canvas name", canvas.title)?.trim();
    if (!title) return;
    setCanvas(await renameCanvas(accessToken, canvas.id, title));
  };

  if (error) return <main className="canvas-page canvas-page--error"><h1>Canvas unavailable</h1><p>{error}</p><button type="button" onClick={() => navigate(-1)}>Back</button></main>;
  if (!canvas || !document) return <main className="canvas-page canvas-page--loading">Opening Canvas…</main>;

  return (
    <main className="canvas-page">
      <header className="canvas-page-header">
        <button type="button" className="icon-button subtle" aria-label="Back" onClick={() => navigate(-1)}><ArrowLeft size={19} /></button>
        <div><h1>{canvas.title}</h1><small>Shared Canvas · server-encrypted storage</small></div>
        <div className="canvas-page-actions">
          {canvas.canManage && <button type="button" onClick={() => void saveTitle()}>Rename</button>}
          {canvas.canManage && <button type="button" onClick={() => setShareOpen((current) => !current)}><Share2 size={16} /> Share</button>}
          <button type="button" onClick={() => addBlock("markdown")}><Plus size={16} /> Markdown</button>
          <button type="button" onClick={() => addBlock("whiteboard")}><Plus size={16} /> Whiteboard</button>
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
