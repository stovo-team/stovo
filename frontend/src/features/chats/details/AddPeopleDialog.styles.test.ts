import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const addPeopleDialog = readFileSync("src/features/chats/details/AddPeopleDialog.tsx", "utf8");
const styles = readFileSync("src/styles.css", "utf8");
const popupStyles = readFileSync("src/components/ui/Popup.css", "utf8");
const newChatDialog = readFileSync("src/features/chats/sidebar/NewChatDialog.tsx", "utf8");

describe("AddPeopleDialog shared popup controls", () => {
  it("uses the shared dialog shell and labeled search field", () => {
    expect(addPeopleDialog).toContain("<PopupDialog");
    expect(addPeopleDialog).toContain("<PopupField");
    expect(addPeopleDialog).toContain('ariaLabelledBy="add-people-title"');
  });

  it("adds comfortable horizontal padding and rounds the search field", () => {
    const dialog = styles.match(/\.add-people-dialog\s*\{([^}]*)\}/s)?.[1] ?? "";
    expect(addPeopleDialog).toContain("<PopupField");
    expect(dialog).toMatch(/padding:\s*0\s+24px\s+20px/);
    expect(popupStyles).toMatch(/\.popup-field__input\s*\{[^}]*border-radius:\s*999px/s);
  });

  it("reuses the same gray circular close control in new-chat dialogs", () => {
    const close = popupStyles.match(/\.popup-close\s*\{([^}]*)\}/s)?.[1] ?? "";
    expect(addPeopleDialog).toContain("<PopupDialog");
    expect(addPeopleDialog).toContain("closeLabel={strings.chats.details.cancel}");
    expect(newChatDialog).toContain("<PopupCloseButton");
    expect(close).toMatch(/background:\s*#6b7280/);
    expect(close).toMatch(/border-radius:\s*50%/);
  });
});
