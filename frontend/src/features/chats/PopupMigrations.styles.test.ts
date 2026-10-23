import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("chat popup shared composition", () => {
  it.each([
    "src/features/chats/sidebar/DefaultChatSectionDialog.tsx",
    "src/features/chats/sidebar/ChatFolderDialog.tsx",
    "src/features/chats/sidebar/ChatList.tsx",
    "src/features/chats/ChatOverlays.tsx",
    "src/features/chats/details/AddPeopleDialog.tsx",
    "src/features/chats/conversation/MessageDialogs.tsx",
    "src/features/chats/composer/ScheduleMessageModal.tsx",
    "src/features/chats/composer/ReminderModal.tsx",
    "src/features/chats/transfer/ChatTransferDialog.tsx",
  ])("uses the shared popup shell in %s", (path) => {
    expect(source(path)).toContain("PopupDialog");
  });

  it("uses shared button variants for message confirmation and deletion", () => {
    const dialogs = source("src/features/chats/conversation/MessageDialogs.tsx");
    expect(dialogs).toContain('variant="secondary"');
    expect(dialogs).toContain('variant="danger"');
  });

  it("preserves alertdialog semantics for message deletion", () => {
    expect(source("src/features/chats/conversation/MessageDialogs.tsx")).toContain('dialogRole="alertdialog"');
  });

  it("uses shared pill fields in chat and composer popup forms", () => {
    for (const path of [
      "src/features/chats/sidebar/NewChatDialog.tsx",
      "src/features/chats/sidebar/ChatFolderDialog.tsx",
      "src/features/chats/details/AddPeopleDialog.tsx",
      "src/features/chats/composer/ReminderModal.tsx",
    ]) {
      expect(source(path)).toContain("PopupField");
    }
    expect(source("src/features/chats/composer/ScheduleMessageModal.tsx")).toContain("PopupSelect");
  });
});
