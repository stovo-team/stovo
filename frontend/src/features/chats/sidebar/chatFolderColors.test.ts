import { describe, expect, it } from "vitest";

import { colorForAvatarId } from "../../../components/avatarIdentity";
import { chatFolderColorValue } from "./chatFolderColors";

describe("chat folder colors", () => {
  it("uses the shared accent for default folders and keeps Direct messages blue", () => {
    expect(chatFolderColorValue("default-groups")).toBe("var(--accent-primary)");
    expect(chatFolderColorValue("default-channels")).toBe("var(--accent-primary)");
    expect(chatFolderColorValue("default-dms")).toBe("var(--avatar-color-blue)");
  });

  it("preserves selected and generated colors for customized folders", () => {
    expect(chatFolderColorValue("default-dms", "orange")).toBe("var(--avatar-color-orange)");
    expect(chatFolderColorValue("custom-folder", "#f08a24")).toBe("#f08a24");
    expect(chatFolderColorValue("custom-folder")).toBe(`var(--avatar-color-${colorForAvatarId("custom-folder")})`);
  });
});
