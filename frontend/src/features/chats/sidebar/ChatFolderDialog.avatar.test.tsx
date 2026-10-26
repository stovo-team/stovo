import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
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
  it("saves a selected symbol and color with the folder", () => {
    const onSave = vi.fn();
    const folder = { id: "folder-work", name: "Work", rules: defaultFolderRules(), symbolId: "folder" as const, colorId: "red" as const };
    const container = mount(onSave, folder);
    act(() => (container.querySelector('[aria-label="Star"]') as HTMLButtonElement | null)?.click());
    act(() => (container.querySelector('[aria-label="Purple"]') as HTMLButtonElement | null)?.click());
    act(() => (container.querySelector('button[type="submit"]') as HTMLButtonElement | null)?.click());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ symbolId: "star", colorId: "purple", name: "Work" }));
  });
});
