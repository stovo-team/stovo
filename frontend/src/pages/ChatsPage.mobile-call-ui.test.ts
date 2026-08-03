import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/pages/ChatsPage.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("mobile active video call UI", () => {
  it("keeps the compact self-view in control-safe fixed corners", () => {
    expect(source).toContain("const [isSelfViewFullscreen, setIsSelfViewFullscreen]");
    expect(source).toContain("const [selfViewSide, setSelfViewSide]");
    expect(source).toContain('areControlsVisible ? "top" : "bottom"');
    expect(styles).toContain(".mobile-active-pip");
    expect(styles).toContain("width: 104px");
    expect(styles).toContain(".mobile-active-pip--top");
    expect(styles).toContain(".mobile-active-pip--bottom");
    expect(styles).toContain(".mobile-active-pip--top.mobile-active-pip--right");
    expect(styles).toContain(".mobile-active-pip--bottom");
  });

  it("puts camera flip on the compact self-view instead of the control row", () => {
    expect(source).toContain("mobile-active-pip-flip");
    expect(source).toContain("aria-label=\"Flip camera\"");
    expect(source).not.toContain("{/* Flip camera â€” only during video */}");
  });

  it("blacks out local preview before applying mirror during camera flip", () => {
    expect(source).toContain("const [isCameraFlipping, setIsCameraFlipping]");
    expect(source).toContain("const [previewFacingMode, setPreviewFacingMode]");
    expect(source).toContain("Let the blackout paint before facingMode/mirror state updates");
    expect(source).toContain("setPreviewFacingMode(nextFacing)");
    expect(source).toContain("dst.srcObject = null");
    expect(styles).toContain(".mobile-active-pip {\n  position: absolute;\n  width: 104px;\n  height: 140px;\n  border: 2px solid rgba(255, 255, 255, 0.35);\n  border-radius: 8px;\n  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.42);\n  background: #000;");
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
