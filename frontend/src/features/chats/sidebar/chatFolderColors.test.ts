import { describe, expect, it } from "vitest";

import { colorForAvatarId } from "../../../components/avatarIdentity";
import { chatFolderColorValue } from "./chatFolderColors";

describe("chat folder colors", () => {
  it("uses a neutral gray for the default Groups folder and keeps other defaults", () => {
    expect(chatFolderColorValue("default-groups")).toBe("var(--text-secondary)");
    expect(chatFolderColorValue("default-channels")).toBe("var(--accent-primary)");
    expect(chatFolderColorValue("default-dms")).toBe("var(--avatar-color-blue)");
  });

  it("preserves selected and generated colors for customized folders", () => {
    expect(chatFolderColorValue("default-groups", "orange")).toBe("var(--avatar-color-orange)");
    expect(chatFolderColorValue("default-dms", "orange")).toBe("var(--avatar-color-orange)");
    expect(chatFolderColorValue("custom-folder", "#f08a24")).toBe("#f08a24");
    expect(chatFolderColorValue("custom-folder")).toBe(`var(--avatar-color-${colorForAvatarId("custom-folder")})`);
  });
});
