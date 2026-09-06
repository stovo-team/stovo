import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import * as Y from "yjs";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { ChevronDown, Pencil, Plus, Share2, X } from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import { getSocketConfigForUrl } from "../api/serverRegistry";
import { getApiUrl } from "../api/client";
import { appendCanvasDocumentUpdate, getCanvas, getCanvasDocument, linkCanvas, renameCanvas, type Canvas } from "../api/canvas";
import type { Chat } from "../api/chats";
import { getChats } from "../api/chats";
import { ForwardChatList } from "../features/chats/conversation/MessageDialogs";
import { BackButton } from "../components/BackButton";

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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character] ?? character);
}

function markdownToEditableHtml(value: string) {
  return value.split("\n").map((line) => {
    const heading = /^(#{1,6})\s+(.*)$/u.exec(line);
    if (heading) return `<h${heading[1].length}>${escapeHtml(heading[2]) || "<br>"}</h${heading[1].length}>`;
    const bullet = /^[-*+]\s+(.*)$/u.exec(line);
    if (bullet) return `<ul><li>${escapeHtml(bullet[1]) || "<br>"}</li></ul>`;
    return `<p>${escapeHtml(line) || "<br>"}</p>`;
  }).join("");
}

function editableHtmlToMarkdown(editor: HTMLDivElement) {
  return Array.from(editor.children).map((block) => {
    const level = /^H([1-6])$/u.exec(block.tagName);
    const text = block.textContent?.replace(/\u00a0/g, " ") ?? "";
    if (level) return `${"#".repeat(Number(level[1]))} ${text}`;
    if (block.tagName === "UL") return Array.from(block.querySelectorAll(":scope > li")).map((item) => `- ${item.textContent?.replace(/\u00a0/g, " ") ?? ""}`).join("\n");
    return text;
  }).join("\n");
}

function moveCursorToEnd(element: HTMLElement) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function currentEditorBlock(editor: HTMLDivElement) {
  const node = window.getSelection()?.anchorNode;
  let element = node?.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node?.parentElement ?? null;
  while (element && element.parentElement !== editor) element = element.parentElement;
  return element?.parentElement === editor ? element : null;
}

function replaceWithHeading(block: HTMLElement, level: number, content: string) {
  const replacement = document.createElement(`h${level}`);
  replacement.textContent = content;
  if (!content) replacement.append(document.createElement("br"));
  block.replaceWith(replacement);
  moveCursorToEnd(replacement);
}

function MarkdownBlock({ record }: { record: Y.Map<unknown> }) {
  const text = record.get("content") as Y.Text;
  const [value, setValue] = useState(() => text?.toString() ?? "");
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const update = () => setValue(text?.toString() ?? "");
    text?.observe(update);
    return () => text?.unobserve(update);
  }, [text]);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) return;
    editor.innerHTML = markdownToEditableHtml(value);
  }, [value]);

  const saveEditor = (editor: HTMLDivElement) => {
    const next = editableHtmlToMarkdown(editor);
    text.doc?.transact(() => { text.delete(0, text.length); text.insert(0, next); });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== " " || event.nativeEvent.isComposing) return;
    const editor = event.currentTarget;
    const block = currentEditorBlock(editor);
    if (!block || !["P", "DIV"].includes(block.tagName)) return;
    const textBeforeSpace = block.textContent ?? "";
    const heading = /^(#{1,6})$/u.exec(textBeforeSpace);
    if (heading) {
      event.preventDefault();
      replaceWithHeading(block, heading[1].length, "");
      saveEditor(editor);
      return;
    }
    if (/^[-*+]$/u.test(textBeforeSpace)) {
      event.preventDefault();
      const list = document.createElement("ul");
      const item = document.createElement("li");
      item.append(document.createElement("br"));
      list.append(item);
      block.replaceWith(list);
      moveCursorToEnd(item);
      saveEditor(editor);
    }
  };

  const handleInput = (event: React.FormEvent<HTMLDivElement>) => {
    const editor = event.currentTarget;
    const block = currentEditorBlock(editor);
    const heading = block && /^(#{1,6})\s+(.*)$/u.exec(block.textContent ?? "");
    if (block && heading && ["P", "DIV"].includes(block.tagName)) {
      replaceWithHeading(block, heading[1].length, heading[2]);
    }
    saveEditor(editor);
  };

  if (!text) return null;
  return (
    <section className="canvas-markdown-block">
      <div ref={editorRef} className="canvas-markdown-editor" contentEditable suppressContentEditableWarning role="textbox" aria-label="Canvas document" aria-multiline="true" onKeyDown={handleKeyDown} onInput={handleInput} />
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
  const { accessToken, currentUser } = useAuth();
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
  const pendingUpdatesRef = useRef<Uint8Array[]>([]);
  const isSavingRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!accessToken || !canvasId) return;
    let cancelled = false;
    saveQueueRef.current = [];
    pendingUpdatesRef.current = [];
    isSavingRef.current = false;
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
          if (isSavingRef.current || !accessToken) return;
          isSavingRef.current = true;
          try {
            while (saveQueueRef.current.length > 0) {
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
        const scheduleSave = () => {
          if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
          saveTimerRef.current = window.setTimeout(() => {
            saveTimerRef.current = null;
            const updates = pendingUpdatesRef.current.splice(0);
            if (updates.length === 0) return;
            saveQueueRef.current.push(bytesToBase64(Y.mergeUpdates(updates)));
            void flushSaveQueue();
          }, 180);
        };
        doc.on("update", (update, origin) => {
          if (origin === remoteOrigin) return;
          pendingUpdatesRef.current.push(update);
          scheduleSave();
        });
        blocks.observe(() => setBlocksRevision((current) => current + 1));
        if (blocks.length === 0) doc.transact(() => blocks.push([createBlock("markdown", `# ${loadedCanvas.title}\n\n`)]));
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not open Canvas");
      }
    };
    void connect();
    return () => {
      cancelled = true;
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      const unsaved = pendingUpdatesRef.current.splice(0);
      if (unsaved.length > 0) {
        void appendCanvasDocumentUpdate(accessToken, canvasId, bytesToBase64(Y.mergeUpdates(unsaved)));
      }
      socketRef.current?.disconnect();
      socketRef.current = null;
      doc.destroy();
    };
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

  if (error) return <main className="canvas-page canvas-page--error"><h1>Canvas unavailable</h1><p>{error}</p><BackButton ariaLabel="Back" title="Back" onClick={() => navigate(-1)} /></main>;
  if (!canvas || !document) return <main className="canvas-page canvas-page--loading">Opening Canvas…</main>;

  return (
    <main className="canvas-page">
      <header className="canvas-page-header">
        <BackButton ariaLabel="Back" title="Back" onClick={() => navigate(-1)} />
        <div className="canvas-title-group">
          {isEditingTitle ? <input className="canvas-title-input" aria-label="Canvas name" autoFocus maxLength={160} value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} onBlur={() => void saveTitle()} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveTitle(); } if (event.key === "Escape") { setIsEditingTitle(false); } }} /> : <h1>{canvas.title}</h1>}
          {canvas.canManage && !isEditingTitle && <button type="button" className="canvas-title-edit" aria-label="Edit canvas name" title="Edit canvas name" onClick={() => { setTitleDraft(canvas.title); setIsEditingTitle(true); }}><Pencil size={13} /></button>}
        </div>
        <div className="canvas-page-actions">
          {canvas.canManage && <button type="button" className="canvas-icon-action" aria-label="Share canvas" title="Share canvas" onClick={() => setShareOpen((current) => !current)}><Share2 size={18} /></button>}
          <div className="canvas-insert-menu">
            <button type="button" className="canvas-add-button" aria-label="Insert into canvas" aria-expanded={insertOpen} onClick={() => setInsertOpen((current) => !current)}><Plus size={18} /><ChevronDown size={15} /></button>
            {insertOpen && <div className="canvas-insert-dropdown" role="menu"><button type="button" role="menuitem" onClick={addWhiteboard}><Pencil size={16} /><span><strong>Whiteboard</strong><small>Insert a live drawing board</small></span></button></div>}
          </div>
        </div>
      </header>
      {shareOpen && canvas.canManage && (
        <div className="modal-backdrop" role="presentation">
          <section className="messenger-modal canvas-share-dialog" role="dialog" aria-modal="true" aria-labelledby="canvas-share-title">
            <div className="modal-header"><h2 id="canvas-share-title">Share Canvas</h2><button type="button" className="icon-button subtle" aria-label="Close share dialog" title="Close" onClick={() => setShareOpen(false)}><X aria-hidden="true" size={18} /></button></div>
            <p className="forward-preview">Choose a chat to share “{canvas.title}” with.</p>
            <ForwardChatList accessToken={accessToken} currentUserId={currentUser?.id} chats={chats.filter((chat) => !canvas.linkedChatIds.includes(chat.id))} onSelect={(chatId) => { if (accessToken) void linkCanvas(accessToken, canvas.id, chatId).then((next) => { setCanvas(next); setShareOpen(false); }); }} />
          </section>
        </div>
      )}
      <div className="canvas-workspace">
        {blocks.map((block) => block.kind === "markdown" ? <MarkdownBlock key={block.id} record={block.record} /> : <WhiteboardBlock key={block.id} record={block.record} />)}
      </div>
    </main>
  );
}
