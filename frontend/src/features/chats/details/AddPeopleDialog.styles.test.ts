import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const addPeopleDialog = readFileSync("src/features/chats/details/AddPeopleDialog.tsx", "utf8");
const styles = readFileSync("src/styles.css", "utf8");

describe("AddPeopleDialog shared popup controls", () => {
  it("uses the shared dialog shell and labeled search field", () => {
    expect(addPeopleDialog).toContain("<PopupDialog");
    expect(addPeopleDialog).toContain("<PopupField");
    expect(addPeopleDialog).toContain('ariaLabelledBy="add-people-title"');
  });

  it("keeps only content spacing local to the dialog surface", () => {
    const dialogStyle = styles.match(/\.add-people-dialog\s*\{([^}]*)\}/s)?.[1] ?? "";
    expect(dialogStyle).toMatch(/padding:\s*24px/);
    expect(dialogStyle).not.toMatch(/background:|border:|border-radius:|box-shadow:/);
  });
});
