import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/pages/ChatsPage.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("mobile active video call UI", () => {
  it("supports a draggable, swappable self-view above the call controls", () => {
    expect(source).toContain("const [isSelfViewFullscreen, setIsSelfViewFullscreen]");
    expect(source).toContain("beginPipDrag");
    expect(source).toContain("swapVideoViews");
    expect(styles).toContain(".mobile-active-pip");
    expect(styles).toContain("z-index: 20");
  });

  it("hides only the lower controls after inactivity and lets a screen tap reveal them", () => {
    expect(source).toContain("const [areControlsVisible, setAreControlsVisible]");
    expect(source).toContain("CALL_CONTROLS_HIDE_DELAY_MS");
    expect(source).toContain("onPointerDown={toggleControls}");
    expect(source).toContain("mobile-active-controls--hidden");
    expect(styles).toContain(".mobile-active-controls--hidden");
  });

  it("does not show a generic video call title in the popup header", () => {
    expect(source).not.toContain('      ? "Video call"\n      : "Audio call"');
  });

  it("uses compact spacing for the bottom app navigation", () => {
    expect(styles).toContain(".app-frame > .app-nav .app-nav-links {\n    display: flex;\n    flex: 1;\n    gap: 0;");
  });
});
