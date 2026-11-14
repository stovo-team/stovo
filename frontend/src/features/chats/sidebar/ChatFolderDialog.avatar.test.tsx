import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatFolderDialog } from "./ChatFolderDialog";
import { defaultFolderRules, type ChatFolder } from "./chatFolders";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
const mounts: HTMLDivElement[] = [];

function mount(onSave: (folder: ChatFolder) => void, folder: ChatFolder) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  mounts.push(container);
  act(() => root.render(<ChatFolderDialog folder={folder} onClose={vi.fn()} onDelete={vi.fn()} onSave={onSave} />));
  return document.body;
}

afterEach(() => {
  while (roots.length) act(() => roots.pop()?.unmount());
  mounts.forEach((mountPoint) => mountPoint.remove());
});

describe("ChatFolderDialog avatar choices", () => {
  it("places the delete action last in settings with a decorative SVG icon", () => {
    const onDelete = vi.fn();
    const folder = { id: "folder-work", name: "Work", rules: defaultFolderRules(), symbolId: "folder" as const, colorId: "red" as const };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    mounts.push(container);
    act(() => root.render(<ChatFolderDialog folder={folder} onClose={vi.fn()} onDelete={onDelete} onSave={vi.fn()} />));

    const body = document.body.querySelector(".chat-folder-body");
    const deleteButton = body?.querySelector<HTMLButtonElement>(".chat-folder-delete");
    expect(body?.lastElementChild).toBe(deleteButton);
    expect(deleteButton?.querySelector("svg")).not.toBeNull();
    expect(deleteButton?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(document.body.querySelector(".chat-folder-actions .chat-folder-delete")).toBeNull();

    act(() => deleteButton?.click());
    expect(onDelete).toHaveBeenCalledWith(folder);
  });

  it("saves a selected symbol and color with the folder", () => {
    const onSave = vi.fn();
    const folder = { id: "folder-work", name: "Work", rules: defaultFolderRules(), symbolId: "folder" as const, colorId: "red" as const };
    const container = mount(onSave, folder);
    act(() => (container.querySelector('[aria-label="Star"]') as HTMLButtonElement | null)?.click());
    act(() => (container.querySelector('[aria-label="Purple"]') as HTMLButtonElement | null)?.click());
    act(() => (container.querySelector('button[type="submit"]') as HTMLButtonElement | null)?.click());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ symbolId: "star", colorId: "purple", name: "Work" }));
  });

  it("renders folder icons after their disclosure arrows without a colored disk", () => {
    const list = readFileSync("src/features/chats/sidebar/ChatList.tsx", "utf8");
    const styles = readFileSync("src/styles/shared-interactions.css", "utf8");
    const folderStyles = readFileSync("src/styles/message-rendering.css", "utf8");
    const headerStyles = readFileSync("src/styles/conversation.css", "utf8");
    const tokens = readFileSync("src/design-system/tokens.css", "utf8");
    const firstArrow = list.indexOf('<ChevronDown size={16} aria-hidden="true" className={collapsed[section.key]');
    const firstFolderIcon = list.indexOf('className="chat-folder-avatar"');
    expect(firstArrow).toBeGreaterThanOrEqual(0);
    expect(firstFolderIcon).toBeGreaterThan(firstArrow);
    expect(styles).toContain('.entity-avatar[data-avatar-kind="folder"] { background: transparent; color: var(--avatar-custom-bg); }');
    expect(tokens).toContain("--avatar-color-purple: var(--color-palette-97b1caaa7b50);");
    expect(folderStyles).not.toContain(".chat-section-heading:hover .chat-folder-controls");
    expect(headerStyles).toContain(".chat-header-actions button:hover:not(:disabled)");
    expect(headerStyles).toContain("  background: transparent;\n  border-color: transparent;");
  });
});

it("applies the selected folder color to its icon and name", () => {
  const styles = readFileSync("src/styles/shared-interactions.css", "utf8");
  const list = readFileSync("src/features/chats/sidebar/ChatList.tsx", "utf8");
  expect(styles).toContain('.entity-avatar[data-avatar-kind="folder"] { background: transparent; color: var(--avatar-custom-bg); }');
  expect(list).toContain('className="chat-folder-name"');
  expect(styles).toContain('.chat-folder-avatar + .chat-folder-name');
});

it("truncates long folder names without centering or wrapping them", () => {
  const styles = readFileSync("src/styles/avatar-controls.css", "utf8");
  const collapseRule = styles.match(/\.chat-section-collapse\s*\{([^}]*)\}/)?.[1] ?? "";
  const nameRule = styles.match(/\.chat-folder-name\s*\{([^}]*)\}/)?.[1] ?? "";

  expect(collapseRule).toMatch(/flex:\s*1 1 auto;/);
  expect(collapseRule).toMatch(/min-width:\s*0;/);
  expect(nameRule).toMatch(/min-width:\s*0;/);
  expect(nameRule).toMatch(/overflow:\s*hidden;/);
  expect(nameRule).toMatch(/text-overflow:\s*ellipsis;/);
  expect(nameRule).toMatch(/white-space:\s*nowrap;/);
  expect(nameRule).toMatch(/text-align:\s*left;/);
});

it("does not override the selected chat avatar background with the chat type", () => {
  const styles = readFileSync("src/styles/app-shell.css", "utf8");
  expect(styles).not.toMatch(/\.chat-avatar\.(?:group|family)\s*\{\s*background:/);
});
