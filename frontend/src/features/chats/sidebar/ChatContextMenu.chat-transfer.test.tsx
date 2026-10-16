import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Chat } from "../../../api/chats";
import { ChatContextMenu } from "./ChatContextMenu";
import { ChatFolderDialog } from "./ChatFolderDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.replaceChildren();
});

function renderMenu(onImportChat = vi.fn(), onExportChat = vi.fn()) {
  const chat = {
    id: "selected-chat",
    title: "Planning",
    type: "group",
    unreadCount: 0,
    isMuted: false,
    isFavorite: false
  } as unknown as Chat;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);

  act(() => {
    root.render(
      <ChatContextMenu
        menu={{ chat, x: 40, y: 40 }}
        folders={[]}
        onClose={vi.fn()}
        onOpenChat={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleFavorite={vi.fn()}
        onImportChat={onImportChat}
        onExportChat={onExportChat}
      />
    );
  });

  return { chat, container, onImportChat, onExportChat };
}

describe("ChatContextMenu chat transfer actions", () => {
  it("shows import and export actions in the selected chat menu", () => {
    const { container } = renderMenu();

    const items = Array.from(container.querySelectorAll('[role="menuitem"]')).map((item) => item.textContent?.trim());
    expect(items).toContain("Import chat from file");
    expect(items).toContain("Export chat");
  });

  it("localizes chat actions and folder settings in Russian", () => {
    Object.defineProperty(navigator, "language", { configurable: true, value: "ru-RU" });
    const { container } = renderMenu();
    expect(container.textContent).toContain("Открыть чат");
    expect(container.textContent).toContain("Отключить уведомления");
    expect(container.textContent).toContain("Добавить в избранное");

    const folderContainer = document.createElement("div");
    document.body.appendChild(folderContainer);
    const folderRoot = createRoot(folderContainer);
    roots.push(folderRoot);
    act(() => folderRoot.render(<ChatFolderDialog folder={null} onClose={vi.fn()} onSave={vi.fn()} onDelete={vi.fn()} />));
    expect(document.body.textContent).toContain("Название папки");
    expect(document.body.textContent).toContain("Личные сообщения");
    expect(document.body.textContent).not.toContain("Folder name");
    Object.defineProperty(navigator, "language", { configurable: true, value: "en-US" });
  });

  it("uses a down-arrow tray icon for import and the matching up-arrow icon for export", () => {
    const { container } = renderMenu();
    const importButton = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
      .find((item) => item.textContent?.includes("Import chat from file"));
    const exportButton = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
      .find((item) => item.textContent?.includes("Export chat"));

    expect(importButton?.querySelector("svg")?.classList.contains("lucide-download")).toBe(true);
    expect(exportButton?.querySelector("svg")?.classList.contains("lucide-upload")).toBe(true);
  });

  it("passes the selected chat to both actions and does not select a different target chat", () => {
    const onImportChat = vi.fn();
    const onExportChat = vi.fn();
    const { chat, container } = renderMenu(onImportChat, onExportChat);

    const importButton = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
      .find((item) => item.textContent?.includes("Import chat from file"));
    const exportButton = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
      .find((item) => item.textContent?.includes("Export chat"));

    act(() => importButton?.click());
    act(() => exportButton?.click());

    expect(onImportChat).toHaveBeenCalledWith(chat);
    expect(onExportChat).toHaveBeenCalledWith(chat);
  });
});
